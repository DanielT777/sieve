import * as vscode from 'vscode';
import type { ReviewState } from '../review/triage.enum';
import type { ReviewDeskItem } from './review-desk.items';
import { TRIAGE_ICON } from './triage.icons';

/** A folder node in the Review Desk tree. Shows aggregate triage state and file count. */
export class FolderItem extends vscode.TreeItem {
  constructor(
    readonly name: string,
    readonly children: ReviewDeskItem[],
    aggregateState: ReviewState,
    fileCount: number,
  ) {
    super(name, vscode.TreeItemCollapsibleState.Expanded);
    this.description = String(fileCount);
    this.iconPath = TRIAGE_ICON[aggregateState];
    this.contextValue = 'folder';
  }
}
