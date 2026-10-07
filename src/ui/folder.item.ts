import * as vscode from 'vscode';
import type { ReviewState } from '../review/triage.enum';
import type { ReviewStats } from '../review/review.session';
import type { ReviewDeskItem } from './review-desk.items';
import { FOLDER_ICON } from './triage.icons';

/**
 * A folder node in the Review Desk tree. The folder icon keeps folders distinct
 * from files; its color carries the aggregate triage state.
 */
export class FolderItem extends vscode.TreeItem {
  constructor(
    readonly name: string,
    readonly children: ReviewDeskItem[],
    aggregateState: ReviewState,
    stats: ReviewStats,
  ) {
    super(name, vscode.TreeItemCollapsibleState.Expanded);
    this.description = `${stats.reviewed}/${stats.total}`;
    this.tooltip = stats.flagged > 0
      ? `${stats.reviewed} of ${stats.total} files reviewed, ${stats.flagged} flagged`
      : `${stats.reviewed} of ${stats.total} files reviewed`;
    this.iconPath = FOLDER_ICON[aggregateState];
    this.contextValue = 'folder';
  }
}
