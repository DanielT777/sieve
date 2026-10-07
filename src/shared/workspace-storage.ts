import * as fs from 'fs/promises';
import { constants } from 'fs';
import { createHash } from 'crypto';
import { homedir } from 'os';
import * as path from 'path';
import { ANNOTATIONS_FILE, SIEVE_DIR, TRIAGE_FILE, WORKSPACE_FILE } from './config';

export function workspaceStoragePath(
  workspacePath: string,
  sieveHome = path.join(homedir(), SIEVE_DIR),
): string {
  const id = createHash('sha256').update(path.resolve(workspacePath)).digest('hex');
  return path.join(sieveHome, 'workspaces', id);
}

/**
 * Creates workspace metadata and moves earlier state into it once. Legacy
 * directories are tried in order; a file already present is never replaced.
 */
export async function prepareWorkspaceStorage(
  workspacePath: string,
  storagePath = workspaceStoragePath(workspacePath),
  legacyDirs: readonly string[] = [path.join(workspacePath, SIEVE_DIR)],
): Promise<void> {
  await fs.mkdir(storagePath, { recursive: true });

  for (const legacyDir of legacyDirs) {
    await Promise.all([
      migrateLegacyFile(legacyDir, storagePath, TRIAGE_FILE),
      migrateLegacyFile(legacyDir, storagePath, ANNOTATIONS_FILE),
    ]);
  }

  await fs.writeFile(
    path.join(storagePath, WORKSPACE_FILE),
    JSON.stringify({ version: 1, workspacePath: path.resolve(workspacePath) }, null, 2),
    'utf-8',
  );
}

async function migrateLegacyFile(
  legacyDir: string,
  storagePath: string,
  filename: string,
): Promise<void> {
  const legacyPath = path.join(legacyDir, filename);
  try {
    await fs.copyFile(
      legacyPath,
      path.join(storagePath, filename),
      constants.COPYFILE_EXCL,
    );
    await fs.unlink(legacyPath).catch(() => {});
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'EEXIST') throw err;
  }
}
