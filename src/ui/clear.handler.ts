import * as vscode from 'vscode';
import type { SieveSession } from '../shared/sieve.session';
import { logger } from '../shared/logger';

/**
 * Clears all triage states and annotations after a confirmation warning.
 */
export async function clearReview(session: SieveSession): Promise<void> {
  const answer = await vscode.window.showWarningMessage(
    'Sieve: Clear the entire review? This will reset all triage states and delete all annotations.',
    { modal: true },
    'Clear Everything',
  );

  if (answer !== 'Clear Everything') return;

  try {
    session.triage.clearAll();
    session.annotationController.disposeAllThreads();
    await session.annotations.clearAll();
    session.treeProvider.refresh();
    void vscode.window.showInformationMessage('Sieve: Review cleared.');
  } catch (err) {
    logger.error('Failed to clear review', err);
    void vscode.window.showErrorMessage('Sieve: Failed to clear review — see Output panel.');
  }
}
