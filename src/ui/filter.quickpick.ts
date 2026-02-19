import * as vscode from 'vscode';
import type { ReviewDeskProvider } from './review-desk.provider';

/** Opens a QuickPick to filter the Review Desk by triage status. */
export async function showFilterQuickPick(provider: ReviewDeskProvider): Promise<void> {
  const options = [
    { label: '$(list-unordered) All', value: 'all' as const },
    { label: '$(circle-outline) Unreviewed', value: 'unreviewed' as const },
    { label: '$(pass-filled) Reviewed', value: 'reviewed' as const },
    { label: '$(flag) Flagged', value: 'flagged' as const },
  ];
  const picked = await vscode.window.showQuickPick(options, {
    placeHolder: 'Filter by review status',
  });
  if (picked) provider.setFilter(picked.value);
}
