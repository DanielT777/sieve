import * as fs from 'fs/promises';
import * as path from 'path';
import type { ReviewState } from './triage.enum';
import type { TriageManager } from './triage.manager';
import { TRIAGE_FILE } from '../shared/config';
import { logger } from '../shared/logger';

const VALID_STATES: ReadonlySet<string> = new Set<ReviewState>(['unreviewed', 'reviewed', 'flagged']);

function isValidReviewState(value: unknown): value is ReviewState {
  return typeof value === 'string' && VALID_STATES.has(value);
}

function isValidTriageData(data: unknown): data is Record<string, ReviewState> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false;
  return Object.values(data).every(isValidReviewState);
}

/** Persists the current triage state to `.sieve/triage.json`. */
export async function saveTriage(
  triage: TriageManager,
  workspacePath: string,
): Promise<void> {
  const filePath = path.join(workspacePath, TRIAGE_FILE);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(triage.toJSON(), null, 2), 'utf-8');
}

/** Loads triage state from `.sieve/triage.json` into the manager. No-op if file absent. */
export async function loadTriage(
  triage: TriageManager,
  workspacePath: string,
): Promise<void> {
  try {
    const filePath = path.join(workspacePath, TRIAGE_FILE);
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    if (!isValidTriageData(parsed)) {
      logger.warn('Triage file contains invalid data — starting fresh.');
      return;
    }

    triage.fromJSON(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      logger.error('Failed to load triage state', err);
    }
    // File doesn't exist yet — start fresh.
  }
}
