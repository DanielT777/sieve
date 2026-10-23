import * as vscode from 'vscode';
import type { SieveSession } from '../shared/sieve.session';
import type { ReviewRepository } from '../review/review.repository';
import { CHECKPOINT_SOURCE_ID } from '../diff/diff.model';
import { saveCheckpoint } from '../diff/checkpoint.store';
import { workspaceStoragePath } from '../shared/workspace-storage';
import { logger } from '../shared/logger';
import { SourceItem } from './source.item';

/**
 * Snapshots every repository as it is now. From then on, "Since last review"
 * lists only what changes after this point, starting with nothing reviewed.
 */
export async function setCheckpoint(session: SieveSession): Promise<void> {
  try {
    await Promise.all(session.repositories().map(async repository => {
      const checkpoint = await repository.diff.createCheckpoint();
      await saveCheckpoint(checkpoint, workspaceStoragePath(repository.root));
      repository.triage.clearSource(CHECKPOINT_SOURCE_ID);
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
      repository.diff.setCheckpoint(undefined);
      await saveCheckpoint(undefined, workspaceStoragePath(repository.root));
      repository.triage.clearSource(CHECKPOINT_SOURCE_ID);
    }));
  } catch (err) {
    logger.error('Failed to clear the review checkpoint', err);
  }
  await session.treeProvider.reload();
}
