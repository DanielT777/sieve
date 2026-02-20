import * as fs from 'fs/promises';
import * as path from 'path';
import { SIEVE_DIR } from './config';
import { logger } from './logger';

/**
 * Ensures `.sieve/` is listed in `.git/info/exclude` so that
 * review data never shows up as untracked files.
 *
 * Uses `.git/info/exclude` instead of `.gitignore` because it is
 * local to the clone, never committed, and designed for exactly
 * this kind of per-developer ignore rule.
 *
 * Silently no-ops when the repo has no `.git/` dir or on any I/O error.
 */
export async function ensureSieveExcluded(workspacePath: string): Promise<void> {
  const excludePath = path.join(workspacePath, '.git', 'info', 'exclude');

  try {
    const content = await fs.readFile(excludePath, 'utf-8');
    if (content.includes(`${SIEVE_DIR}/`)) return;

    await fs.appendFile(excludePath, `\n# Sieve review data\n${SIEVE_DIR}/\n`, 'utf-8');
    logger.info(`Added ${SIEVE_DIR}/ to .git/info/exclude`);
  } catch {
    // No .git dir, no info/exclude file, or other I/O error — skip silently.
  }
}
