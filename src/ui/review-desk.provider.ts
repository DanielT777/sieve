import * as vscode from 'vscode';
import type { ChangedFile } from '../diff/diff.model';
import { reviewKey } from '../diff/diff.model';
import type { ReviewState } from '../review/triage.enum';
import type { ReviewStats } from '../review/review.session';
import type { ReviewFile, ReviewRepository } from '../review/review.repository';
import { FolderItem } from './folder.item';
import { FileItem } from './file.item';
import { MessageItem } from './message.item';
import { RepositoryItem } from './repository.item';
import { SourceItem } from './source.item';
import { buildReviewTree } from './dir-tree.builder';
import { targetDocumentUri } from '../diff/diff.opener';
import type { ReviewDeskItem } from './review-desk.items';
import { logger } from '../shared/logger';

export type { ReviewDeskItem };

export class ReviewDeskProvider
  implements vscode.TreeDataProvider<ReviewDeskItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<ReviewDeskItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _filesByRepository = new Map<ReviewRepository, readonly ChangedFile[]>();
  private _filesByDocument = new Map<string, ReviewFile>();
  private _filesBySourceAndPath = new Map<string, ReviewFile>();
  private _gitDirty = true;
  private _filter: ReviewState | 'all' = 'all';
  private _onFilesChanged: () => void = () => {};

  constructor(private readonly _repositories: () => readonly ReviewRepository[]) {}

  /** Full refresh — re-fetches git state and rebuilds tree. */
  refresh(): void {
    this._gitDirty = true;
    this._onDidChangeTreeData.fire();
  }

  setOnFilesChanged(fn: () => void): void {
    this._onFilesChanged = fn;
  }

  async reload(): Promise<void> {
    const repositories = this._repositories();
    // One failing repository must not hide the others.
    const changedFiles = await Promise.all(repositories.map(repository =>
      repository.diff.getChangedFiles().catch(err => {
        logger.error(`Failed to read changes in ${repository.root}`, err);
        return [];
      }),
    ));
    this._filesByRepository = new Map(repositories.map((repository, index) => [repository, changedFiles[index]!]));

    const entries = repositories.flatMap((repository, index) =>
      changedFiles[index]!.map(file => ({ repository, file })),
    );
    this._filesByDocument = new Map(
      entries.map(entry => [targetDocumentUri(entry.file).toString(), entry]),
    );
    this._filesBySourceAndPath = new Map(
      entries.map(entry => [sourcePathKey(entry.file.source?.id, entry.file.uri), entry]),
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

  /** Repositories as of the last reload, in display order. */
  get repositories(): readonly ReviewRepository[] {
    return [...this._filesByRepository.keys()];
  }

  /** Review progress over all loaded files (unfiltered), across repositories. */
  computeStats(): ReviewStats {
    let total = 0;
    let reviewed = 0;
    let flagged = 0;
    let unreviewed = 0;
    for (const [repository, files] of this._filesByRepository) {
      const stats = repository.triage.computeStats(files.map(reviewKey));
      total += stats.total;
      reviewed += stats.reviewed;
      flagged += stats.flagged;
      unreviewed += stats.unreviewed;
    }
    return { total, reviewed, flagged, unreviewed };
  }

  getFileForDocument(uri: vscode.Uri): ReviewFile | undefined {
    return this._filesByDocument.get(uri.toString());
  }

  getFile(sourceId: string | undefined, fileUri: string): ReviewFile | undefined {
    return this._filesBySourceAndPath.get(sourcePathKey(sourceId, fileUri));
  }

  getTreeItem(element: ReviewDeskItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ReviewDeskItem): Promise<ReviewDeskItem[]> {
    if (element instanceof RepositoryItem) return element.children;
    if (element instanceof SourceItem) return element.children;
    if (element instanceof FolderItem) return element.children;
    if (element instanceof FileItem) return [];

    // Root call: reload git state only when dirty, then apply filter and build tree.
    if (this._gitDirty) {
      await this.reload();
    }

    // A single repository keeps the flat layout; several get a node each.
    const repositories = this.repositories;
    if (repositories.length === 1) return this._sourceItems(repositories[0]!);
    return repositories.map(repository => new RepositoryItem(repository, this._sourceItems(repository)));
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }

  private _sourceItems(repository: ReviewRepository): SourceItem[] {
    const repositoryFiles = this._filesByRepository.get(repository) ?? [];
    return repository.diff.getSources().map(source => {
      const sourceFiles = repositoryFiles.filter(file => file.source?.id === source.id);
      const files = this._filter === 'all'
        ? sourceFiles
        : sourceFiles.filter(file => repository.triage.getState(reviewKey(file)) === this._filter);
      const children = files.length > 0
        ? buildReviewTree(files, repository)
        : [new MessageItem(
            sourceFiles.length > 0 ? 'No files match the current filter' : 'No changes',
          )];
      return new SourceItem(source, children, sourceFiles.length);
    });
  }
}

function sourcePathKey(sourceId: string | undefined, fileUri: string): string {
  return `${sourceId ?? 'working-tree'}\0${fileUri}`;
}
