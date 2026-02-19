import type { ReviewState } from './triage.enum';
import type { ReviewStats } from './review.session';

/**
 * In-memory store for per-file triage decisions.
 *
 * Fires the registered onChange callback whenever any state changes,
 * letting callers (extension.ts) persist and refresh the UI.
 */
export class TriageManager {
  private readonly _states = new Map<string, ReviewState>();
  private _onChange: () => void = () => {};

  setOnChange(fn: () => void): void {
    this._onChange = fn;
  }

  getState(fileUri: string): ReviewState {
    return this._states.get(fileUri) ?? 'unreviewed';
  }

  setState(fileUri: string, state: ReviewState): void {
    this._states.set(fileUri, state);
    this._onChange();
  }

  computeStats(fileUris: readonly string[]): ReviewStats {
    let reviewed = 0;
    let flagged = 0;
    let unreviewed = 0;

    for (const uri of fileUris) {
      const s = this.getState(uri);
      if (s === 'reviewed') reviewed++;
      else if (s === 'flagged') flagged++;
      else unreviewed++;
    }

    return { total: fileUris.length, reviewed, flagged, unreviewed };
  }

  computeAggregateState(fileUris: readonly string[]): ReviewState {
    if (fileUris.length === 0) return 'unreviewed';
    let allReviewed = true;
    for (const uri of fileUris) {
      const s = this.getState(uri);
      if (s === 'flagged') return 'flagged';
      if (s !== 'reviewed') allReviewed = false;
    }
    return allReviewed ? 'reviewed' : 'unreviewed';
  }

  toJSON(): Record<string, ReviewState> {
    return Object.fromEntries(this._states);
  }

  fromJSON(data: Record<string, ReviewState>): void {
    this._states.clear();
    for (const [uri, state] of Object.entries(data)) {
      this._states.set(uri, state);
    }
  }

  clearAll(): void {
    this._states.clear();
    this._onChange();
  }
}
