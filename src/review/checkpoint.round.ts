import type { ReviewCheckpoint } from '../diff/diff.model';
import { CHECKPOINT_SOURCE_ID } from '../diff/diff.model';
import type { ReviewRepository } from './review.repository';

/**
 * Starts a new review round from `checkpoint`, or ends rounds when undefined.
 * The "Since last review" section starts unreviewed, and comments left in the
 * previous round move to the working tree, which is the same file, so they
 * stay visible once that section stops listing the file.
 */
export async function startReviewRound(
  repository: ReviewRepository,
  checkpoint: ReviewCheckpoint | undefined,
): Promise<void> {
  repository.diff.setCheckpoint(checkpoint);
  repository.triage.clearSource(CHECKPOINT_SOURCE_ID);
  await repository.annotations.moveSource(CHECKPOINT_SOURCE_ID, undefined);
}
