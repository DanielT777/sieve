import type { ChangedFile, FileDiff } from './diff.model';
import type { Disposable } from '../shared/disposable';

/**
 * Abstracts the source of diff data.
 * Swap in a fake implementation for unit tests without touching git.
 */
export interface DiffProvider {
  getChangedFiles(): Promise<readonly ChangedFile[]>;
  getDiff(file: ChangedFile): Promise<FileDiff>;
  /** Returns a handle whose dispose() stops watching. */
  watchChanges(callback: () => void): Disposable;
}
