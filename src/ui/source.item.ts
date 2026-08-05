import * as vscode from 'vscode';
import type { DiffSource } from '../diff/diff.model';
import type { ReviewDeskItem } from './review-desk.items';

export class SourceItem extends vscode.TreeItem {
  constructor(
    readonly source: DiffSource,
    readonly children: ReviewDeskItem[],
    fileCount: number,
  ) {
    super(source.label, vscode.TreeItemCollapsibleState.Expanded);
    this.description = fileCount > 0
      ? `${fileCount} · ${source.description}`
      : source.description;
    this.iconPath = new vscode.ThemeIcon('git-compare');
    this.contextValue = 'source';
  }
}
