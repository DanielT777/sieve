import * as fs from 'fs/promises';
import * as path from 'path';

/** How a working tree relates to its Git metadata. */
export type RepositoryKind = 'repository' | 'worktree' | 'submodule';

export interface RepositoryLayout {
  readonly kind: RepositoryKind;
  /** The Git directory a repository shares with all of its worktrees. */
  readonly commonDir: string;
}

export interface RepositoryCandidate extends RepositoryLayout {
  readonly root: string;
}

/**
 * Tells main working trees, linked worktrees, and submodules apart.
 *
 * Linked worktrees and submodules both have a `.git` file pointing at their
 * Git directory, but only a worktree's Git directory has a `commondir` file,
 * which leads back to the main repository's Git directory.
 */
export async function inspectRepository(root: string): Promise<RepositoryLayout> {
  const dotGit = path.join(root, '.git');
  const stat = await fs.stat(dotGit).catch(() => undefined);
  if (!stat?.isFile()) return { kind: 'repository', commonDir: dotGit };

  const match = /^gitdir:\s*(.+)$/m.exec(await fs.readFile(dotGit, 'utf-8').catch(() => ''));
  if (!match) return { kind: 'repository', commonDir: dotGit };
  const gitDir = path.resolve(root, match[1]!.trim());
  const commonDir = await fs.readFile(path.join(gitDir, 'commondir'), 'utf-8').catch(() => undefined);
  return commonDir === undefined
    ? { kind: 'submodule', commonDir: gitDir }
    : { kind: 'worktree', commonDir: path.resolve(gitDir, commonDir.trim()) };
}

/**
 * Picks the repositories to review: the innermost repository holding each
 * workspace folder (in folder order), then every other repository inside a
 * workspace folder and every other worktree of a repository already picked —
 * Git opens those when `git.detectWorktrees` is on. Submodules stay part of
 * their superproject's review unless opened as a workspace folder.
 */
export function selectRepositories<T extends RepositoryCandidate>(
  candidates: readonly T[],
  workspaceFolders: readonly string[],
): T[] {
  const selected = new Set<T>();
  for (const folder of workspaceFolders) {
    const owner = candidates
      .filter(candidate => isWithin(folder, candidate.root))
      .sort((a, b) => b.root.length - a.root.length)[0];
    if (owner) selected.add(owner);
  }

  const sharedGitDirs = new Set([...selected].map(candidate => comparable(candidate.commonDir)));
  const related = candidates
    .filter(candidate =>
      candidate.kind !== 'submodule' &&
      (sharedGitDirs.has(comparable(candidate.commonDir)) ||
        workspaceFolders.some(folder => isWithin(candidate.root, folder))))
    .sort((a, b) => a.root.localeCompare(b.root));
  for (const candidate of related) selected.add(candidate);

  return [...selected];
}

/**
 * The working tree that owns `fsPath` on disk: the nearest folder at or above
 * it holding a `.git` directory or file. Unlike asking Git for its open
 * repositories, this does not depend on which repositories Git has opened yet.
 */
export async function findRepositoryRoot(fsPath: string): Promise<string | undefined> {
  let current = path.resolve(fsPath);
  for (;;) {
    if (await fs.stat(path.join(current, '.git')).then(() => true, () => false)) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function samePath(left: string, right: string): boolean {
  return comparable(left) === comparable(right);
}

/** True when `child` is `parent` or lies inside it. */
export function isWithin(child: string, parent: string): boolean {
  const relative = path.relative(comparable(parent), comparable(child));
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function comparable(fsPath: string): string {
  const resolved = path.resolve(fsPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
