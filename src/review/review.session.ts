import type { Annotation } from './annotation';
import type { ReviewState } from './triage.enum';

/** The per-file review state stored inside a session. */
export interface FileReviewState {
  state: ReviewState;
  annotations: Annotation[];
  /** ruleId → whether the rule passed for this file. */
  checklistResults: Record<string, boolean>;
}

/** A complete review session. Designed to be serialised to / from JSON. */
export interface ReviewSession {
  readonly id: string;
  name: string;
  readonly createdAt: number; // Unix timestamp (ms)
  updatedAt: number;
  readonly sourceBranch: string;
  readonly targetBranch: string;
  /** Pinned commit SHA used as the diff baseline (overrides branch comparison). */
  baselineCommit: string | undefined;
  /** Keyed by absolute file path. */
  files: Record<string, FileReviewState>;
}

/** Aggregated counts for a session or a filtered subset of files. */
export interface ReviewStats {
  readonly total: number;
  readonly reviewed: number;
  readonly flagged: number;
  readonly unreviewed: number;
}

/** Lightweight summary for session listings (no file or annotation payloads). */
export interface SessionSummary {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly stats: ReviewStats;
}
