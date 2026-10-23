import * as vscode from 'vscode';
import type { SieveSession } from '../shared/sieve.session';
import type { ReviewRepository } from '../review/review.repository';
import { saveCheckpoint } from '../diff/checkpoint.store';
import { startReviewRound } from '../review/checkpoint.round';
import { workspaceStoragePath } from '../shared/workspace-storage';
import { logger } from '../shared/logger';
import { SourceItem } from './source.item';

/**
 * Snapshots the repositories as they are now. From then on, "Since last review"
 * lists only what changes after this point.
 */
export async function setCheckpoint(
  session: SieveSession,
  repositories: readonly ReviewRepository[] = session.repositories(),
): Promise<void> {
  try {
    await Promise.all(repositories.map(async repository => {
      const checkpoint = await repository.diff.createCheckpoint();
      await saveCheckpoint(checkpoint, workspaceStoragePath(repository.root));
      await startReviewRound(repository, checkpoint);
    }));
  } catch (err) {
    logger.error('Failed to set the review checkpoint', err);
    void vscode.window.showErrorMessage('Sieve: Failed to set the review checkpoint — see Output panel.');
  }
  await session.treeProvider.reload();
}

/** Removes the checkpoint of the section clicked, or of every repository. */
export async function clearCheckpoint(session: SieveSession, item?: unknown): Promise<void> {
  const repositories: readonly ReviewRepository[] = item instanceof SourceItem
    ? [item.repository]
    : session.repositories();
  try {
    await Promise.all(repositories.map(async repository => {
      await saveCheckpoint(undefined, workspaceStoragePath(repository.root));
      await startReviewRound(repository, undefined);
    }));
  } catch (err) {
    logger.error('Failed to clear the review checkpoint', err);
  }
  await session.treeProvider.reload();
}
