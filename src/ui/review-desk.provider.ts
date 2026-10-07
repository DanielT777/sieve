import * as vscode from 'vscode';
import type { DiffProvider } from '../diff/diff.provider';
import type { ChangedFile } from '../diff/diff.model';
import { reviewKey } from '../diff/diff.model';
import type { ReviewState } from '../review/triage.enum';
import type { TriageManager } from '../review/triage.manager';
import { FolderItem } from './folder.item';
import { FileItem } from './file.item';
import { MessageItem } from './message.item';
import { SourceItem } from './source.item';
import { buildReviewTree } from './dir-tree.builder';
import { targetDocumentUri } from '../diff/diff.opener';
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
  private _filesByDocument = new Map<string, ChangedFile>();
  private _filesBySourceAndPath = new Map<string, ChangedFile>();
  private _gitDirty = true;
  private _filter: ReviewState | 'all' = 'all';
  private _onFilesChanged: () => void = () => {};

  constructor(
    private readonly _diff: DiffProvider,
    private readonly _triage: TriageManager,
  ) {}

  /** Full refresh — re-fetches git state and rebuilds tree. */
  refresh(): void {
    this._gitDirty = true;
    this._onDidChangeTreeData.fire();
  }

  setOnFilesChanged(fn: () => void): void {
    this._onFilesChanged = fn;
  }

  async reload(): Promise<void> {
    this._currentFiles = await this._diff.getChangedFiles();
    this._fileUriCache = this._currentFiles.map(reviewKey);
    this._filesByDocument = new Map(
      this._currentFiles.map(file => [targetDocumentUri(file).toString(), file]),
    );
    this._filesBySourceAndPath = new Map(
      this._currentFiles.map(file => [sourcePathKey(file.source?.id, file.uri), file]),
    );
    this._gitDirty = false;
    this._onFilesChanged();
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

  getFileForDocument(uri: vscode.Uri): ChangedFile | undefined {
    return this._filesByDocument.get(uri.toString());
  }

  getFile(sourceId: string | undefined, fileUri: string): ChangedFile | undefined {
    return this._filesBySourceAndPath.get(sourcePathKey(sourceId, fileUri));
  }

  getTreeItem(element: ReviewDeskItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ReviewDeskItem): Promise<ReviewDeskItem[]> {
    if (element instanceof SourceItem) return element.children;
    if (element instanceof FolderItem) return element.children;
    if (element instanceof FileItem) return [];

    // Root call: reload git state only when dirty, then apply filter and build tree.
    if (this._gitDirty) {
      await this.reload();
    }

    return this._diff.getSources().map(source => {
      const sourceFiles = this._currentFiles.filter(file => file.source?.id === source.id);
      const isVisible = (file: ChangedFile): boolean =>
        this._filter === 'all' || this._triage.getState(reviewKey(file)) === this._filter;
      const children = sourceFiles.some(isVisible)
        ? buildReviewTree(sourceFiles, this._triage, isVisible)
        : [new MessageItem(
            sourceFiles.length > 0 ? 'No files match the current filter' : 'No changes',
          )];
      return new SourceItem(source, children, sourceFiles.length);
    });
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}

function sourcePathKey(sourceId: string | undefined, fileUri: string): string {
  return `${sourceId ?? 'working-tree'}\0${fileUri}`;
}
