import * as vscode from 'vscode';
import type { SieveSession } from '../shared/sieve.session';
import { logger } from '../shared/logger';

/**
 * Clears all triage states and annotations after a confirmation warning.
 */
export async function clearReview(session: SieveSession): Promise<void> {
  const repositoryCount = session.repositories().length;
  const scope = repositoryCount > 1 ? ` in all ${repositoryCount} repositories` : '';
  const answer = await vscode.window.showWarningMessage(
    `Sieve: Clear the entire review? This will reset all triage states and delete all annotations${scope}.`,
    { modal: true },
    'Clear Everything',
  );

  if (answer !== 'Clear Everything') return;

  try {
    const repositories = session.repositories();
    for (const repository of repositories) repository.triage.clearAll();
    session.annotationController.disposeAllThreads();
    await Promise.all(repositories.map(repository => repository.annotations.clearAll()));
    session.treeProvider.refresh();
    void vscode.window.showInformationMessage('Sieve: Review cleared.');
  } catch (err) {
    logger.error('Failed to clear review', err);
    void vscode.window.showErrorMessage('Sieve: Failed to clear review — see Output panel.');
  }
}
