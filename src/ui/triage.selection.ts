import type * as vscode from 'vscode';
import type { ReviewState } from '../review/triage.enum';
import type { TriageManager } from '../review/triage.manager';
import type { ReviewDeskItem } from './review-desk.items';
import { FileItem } from './file.item';

/**
 * Toggles a triage state on a file.
 *
 * @param item - The tree item passed by the context menu (right-click).
 *               Falls back to `treeView.selection[0]` for keyboard shortcuts.
 */
export function toggleTriageSelected(
  treeView: vscode.TreeView<ReviewDeskItem>,
  triage: TriageManager,
  state: ReviewState,
  item?: unknown,
): void {
  const target = item instanceof FileItem ? item : treeView.selection[0];
  if (target instanceof FileItem) {
    const current = triage.getState(target.file.uri);
    triage.setState(target.file.uri, current === state ? 'unreviewed' : state);
  }
}
