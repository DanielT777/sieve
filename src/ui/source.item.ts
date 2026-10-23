import * as vscode from 'vscode';
import type { DiffSource } from '../diff/diff.model';
import { CHECKPOINT_SOURCE_ID } from '../diff/diff.model';
import type { ReviewRepository } from '../review/review.repository';
import type { ReviewDeskItem } from './review-desk.items';

export class SourceItem extends vscode.TreeItem {
  constructor(
    readonly source: DiffSource,
    readonly repository: ReviewRepository,
    readonly children: ReviewDeskItem[],
    fileCount: number,
  ) {
    super(source.label, vscode.TreeItemCollapsibleState.Expanded);
    this.description = fileCount > 0
      ? `${fileCount} · ${source.description}`
      : source.description;
    const isCheckpoint = source.id === CHECKPOINT_SOURCE_ID;
    this.iconPath = new vscode.ThemeIcon(isCheckpoint ? 'milestone' : 'git-compare');
    // Sections without a target ref end at the working tree; the others are committed comparisons.
    this.contextValue = isCheckpoint ? 'checkpointSource'
      : source.targetRef === undefined ? 'source' : 'committedSource';
  }
}
