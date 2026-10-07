import type { Repository } from '../git';
import type { GitDiffProvider } from '../diff/git-diff.provider';
import type { ChangedFile } from '../diff/diff.model';
import type { AnnotationStore } from '../annotations/annotation.store';
import type { TriageManager } from './triage.manager';
import type { RepositoryKind } from './repository.discovery';

/**
 * One Git working tree under review — the main checkout or a linked worktree.
 * Review state is stored per repository root, which is also where the agent
 * skill looks it up.
 */
export interface ReviewRepository {
  readonly root: string;
  readonly label: string;
  readonly kind: RepositoryKind;
  readonly git: Repository;
  readonly diff: GitDiffProvider;
  readonly triage: TriageManager;
  readonly annotations: AnnotationStore;
}

/** A changed file together with the repository it belongs to. */
export interface ReviewFile {
  readonly repository: ReviewRepository;
  readonly file: ChangedFile;
}
