import type * as vscode from 'vscode';
import type { ReviewState } from '../review/triage.enum';
import type { ReviewDeskItem } from './review-desk.items';
import { FileItem } from './file.item';
import { reviewKey } from '../diff/diff.model';

/**
 * Toggles a triage state on a file.
 *
 * @param item - The tree item passed by the context menu (right-click).
 *               Falls back to `treeView.selection[0]` for keyboard shortcuts.
 */
export function toggleTriageSelected(
  treeView: vscode.TreeView<ReviewDeskItem>,
  state: ReviewState,
  item?: unknown,
): void {
  const target = item instanceof FileItem ? item : treeView.selection[0];
  if (target instanceof FileItem) {
    const { triage } = target.repository;
    const key = reviewKey(target.file);
    const current = triage.getState(key);
    triage.setState(key, current === state ? 'unreviewed' : state);
  }
}
