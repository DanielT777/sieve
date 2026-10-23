import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import type { FileStatus } from './diff.model';

/** A file that differs between two snapshots, as `git diff --name-status` reports it. */
export interface SnapshotChange {
  readonly status: FileStatus;
  /** Relative to the repository root, with forward slashes. */
  readonly path: string;
  readonly oldPath: string | undefined;
}

/**
 * Records the working tree, untracked files included and ignored files left
 * out, as a Git tree object. Files are staged into a throwaway copy of the
 * index, so the real index, HEAD, and refs are never touched — like
 * `git stash create`, only new objects are written.
 */
// ponytail: unreferenced objects are pruned by `git gc` after two weeks; a ref would pin them but show up in the repository.
// Untracked files have no stat cache in the copied index, so they are re-hashed on every snapshot.
export async function snapshotWorkingTree(gitPath: string, root: string): Promise<string> {
  const index = path.join(tmpdir(), `sieve-index-${randomUUID()}`);
  try {
    const realIndex = (await git(gitPath, root, ['rev-parse', '--git-path', 'index'])).trim();
    // Starting from the real index keeps its stat cache; without it every file is re-hashed, which is only slower.
    await fs.copyFile(path.resolve(root, realIndex), index).catch(() => {});
    const env = { ...process.env, GIT_INDEX_FILE: index };
    await git(gitPath, root, ['add', '--all'], env);
    return (await git(gitPath, root, ['write-tree'], env)).trim();
  } finally {
    await fs.rm(index, { force: true });
  }
}

/** Lists the files that differ between two snapshots, following renames. */
export async function diffSnapshots(
  gitPath: string,
  root: string,
  from: string,
  to: string,
): Promise<SnapshotChange[]> {
  const output = await git(gitPath, root, ['diff', '--name-status', '-z', '-M', from, to]);
  return parseNameStatus(output);
}

/** The raw diff of one file between two snapshots. */
export function diffSnapshotFile(
  gitPath: string,
  root: string,
  from: string,
  to: string,
  paths: readonly string[],
): Promise<string> {
  return git(gitPath, root, ['diff', '--no-color', '--no-ext-diff', '-M', from, to, '--', ...paths]);
}

/** Parses `git diff --name-status -z`: a status, then one path, or two for renames and copies. */
export function parseNameStatus(output: string): SnapshotChange[] {
  const tokens = output.split('\0').filter(Boolean);
  const changes: SnapshotChange[] = [];
  for (let i = 0; i < tokens.length;) {
    const code = tokens[i++]!.charAt(0);
    if (code === 'R' || code === 'C') {
      const oldPath = tokens[i++]!;
      const newPath = tokens[i++]!;
      changes.push(code === 'R'
        ? { status: 'renamed', path: newPath, oldPath }
        : { status: 'added', path: newPath, oldPath: undefined });
      continue;
    }
    const status: FileStatus = code === 'A' ? 'added' : code === 'D' ? 'deleted' : 'modified';
    changes.push({ status, path: tokens[i++]!, oldPath: undefined });
  }
  return changes;
}

function git(gitPath: string, cwd: string, args: readonly string[], env?: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(gitPath, args, { cwd, env, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`git ${args[0]} failed: ${stderr.trim() || err.message}`));
      else resolve(stdout);
    });
  });
}
