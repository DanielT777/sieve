import * as vscode from 'vscode';
import type { DiffProvider } from '../diff/diff.provider';
import type { ChangedFile } from '../diff/diff.model';
import type { ReviewState } from '../review/triage.enum';
import type { TriageManager } from '../review/triage.manager';
import { FolderItem } from './folder.item';
import { FileItem } from './file.item';
import { MessageItem } from './message.item';
import { buildReviewTree } from './dir-tree.builder';
import type { ReviewDeskItem } from './review-desk.items';

export type { ReviewDeskItem };

export class ReviewDeskProvider
  implements vscode.TreeDataProvider<ReviewDeskItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<ReviewDeskItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _currentFiles: readonly ChangedFile[] = [];
  private _fileUriCache: readonly string[] = [];
  private _fileUriSet: ReadonlySet<string> = new Set();
  private _gitDirty = true;
  private _filter: ReviewState | 'all' = 'all';

  constructor(
    private readonly _diff: DiffProvider,
    private readonly _triage: TriageManager,
  ) {}

  /** Full refresh — re-fetches git state and rebuilds tree. */
  refresh(): void {
    this._gitDirty = true;
    this._onDidChangeTreeData.fire();
  }

  /** Triage-only refresh — rebuilds tree items without re-fetching git state. */
  refreshTriage(): void {
    this._onDidChangeTreeData.fire();
  }

  setFilter(filter: ReviewState | 'all'): void {
    this._filter = filter;
    this.refreshTriage();
  }

  /** Returns URIs of all currently loaded files (unfiltered), used for stats computation. */
  getFileUris(): readonly string[] {
    return this._fileUriCache;
  }

  /** Returns URIs as a Set for O(1) membership checks. */
  getFileUriSet(): ReadonlySet<string> {
    return this._fileUriSet;
  }

  getTreeItem(element: ReviewDeskItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ReviewDeskItem): Promise<ReviewDeskItem[]> {
    if (element instanceof FolderItem) return element.children;
    if (element instanceof FileItem) return [];

    // Root call: reload git state only when dirty, then apply filter and build tree.
    if (this._gitDirty) {
      this._currentFiles = await this._diff.getChangedFiles();
      this._fileUriCache = this._currentFiles.map(f => f.uri);
      this._fileUriSet = new Set(this._fileUriCache);
      this._gitDirty = false;
    }

    if (this._currentFiles.length === 0) return []; // let viewsWelcome show

    let files: readonly ChangedFile[] = this._currentFiles;
    if (this._filter !== 'all') {
      files = files.filter(f => this._triage.getState(f.uri) === this._filter);
      if (files.length === 0) return [new MessageItem('No files match the current filter')];
    }

    return buildReviewTree(files, this._triage);
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
