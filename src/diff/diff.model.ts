import type { ReviewState } from '../review/triage.enum';

/** The status of a file relative to the working tree. */
export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed';

/** A single line inside a diff hunk. */
export interface DiffLine {
  readonly type: 'added' | 'removed' | 'context';
  readonly content: string;
  /** Line number in the original file — undefined for pure additions. */
  readonly oldLineNumber: number | undefined;
  /** Line number in the new file — undefined for pure deletions. */
  readonly newLineNumber: number | undefined;
}

/**
 * A contiguous block of changes within a file diff (the unit between @@ markers).
 *
 * `id` is derived from the file path + hunk position so it remains stable
 * across session serialisation and deserialisation.
 */
export interface DiffHunk {
  readonly id: string;
  readonly header: string; // e.g. "@@ -10,7 +10,9 @@"
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly lines: readonly DiffLine[];
  /** Review decision for this hunk specifically. */
  state: ReviewState;
}

/** A file that has changed relative to the working tree. */
export interface ChangedFile {
  /** Absolute path. */
  readonly uri: string;
  readonly relativePath: string;
  readonly status: FileStatus;
  /** Set only when status === 'renamed'. */
  readonly oldPath: string | undefined;
}

/** Full diff for a single file. */
export interface FileDiff {
  readonly file: ChangedFile;
  readonly hunks: readonly DiffHunk[];
  readonly additions: number;
  readonly deletions: number;
}
