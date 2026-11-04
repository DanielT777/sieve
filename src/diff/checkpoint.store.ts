import * as fs from 'fs/promises';
import * as path from 'path';
import type { ReviewCheckpoint } from './diff.model';
import { CHECKPOINT_FILE } from '../shared/config';
import { logger } from '../shared/logger';

function isCheckpoint(data: unknown): data is ReviewCheckpoint {
  if (typeof data !== 'object' || data === null) return false;
  const v = data as Record<string, unknown>;
  return typeof v.tree === 'string' && /^[0-9a-f]{40,64}$/.test(v.tree) && typeof v.createdAt === 'number';
}

/** Saves the review checkpoint in Sieve's user-level workspace storage; undefined removes it. */
export async function saveCheckpoint(
  checkpoint: ReviewCheckpoint | undefined,
  storagePath: string,
): Promise<void> {
  const filePath = path.join(storagePath, CHECKPOINT_FILE);
  if (!checkpoint) {
    await fs.rm(filePath, { force: true });
    return;
  }
  await fs.mkdir(storagePath, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
}

/** Loads the review checkpoint, or undefined when none was set. */
export async function loadCheckpoint(storagePath: string): Promise<ReviewCheckpoint | undefined> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(path.join(storagePath, CHECKPOINT_FILE), 'utf-8'));
    if (isCheckpoint(parsed)) return parsed;
    logger.warn('Checkpoint file contains invalid data — ignoring it.');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error('Failed to load the review checkpoint', err);
    }
  }
  return undefined;
}
