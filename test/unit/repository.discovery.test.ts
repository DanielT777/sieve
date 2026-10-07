import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  findRepositoryRoot,
  inspectRepository,
  isWithin,
  samePath,
  selectRepositories,
  type RepositoryCandidate,
} from '../../src/review/repository.discovery';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map(target => fs.rm(target, { recursive: true, force: true })));
});

describe('inspectRepository', () => {
  it('tells main checkouts, linked worktrees, and submodules apart', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'sieve-repos-'));
    temporaryPaths.push(root);

    const main = path.join(root, 'main');
    const worktreeGitDir = path.join(main, '.git', 'worktrees', 'feature');
    await fs.mkdir(worktreeGitDir, { recursive: true });
    await fs.writeFile(path.join(worktreeGitDir, 'commondir'), '../..\n');
    await fs.mkdir(path.join(main, '.git', 'modules', 'lib'), { recursive: true });

    const worktree = path.join(root, 'feature');
    await fs.mkdir(worktree);
    await fs.writeFile(path.join(worktree, '.git'), `gitdir: ${worktreeGitDir}\n`);

    const submodule = path.join(main, 'lib');
    await fs.mkdir(submodule);
    await fs.writeFile(path.join(submodule, '.git'), 'gitdir: ../.git/modules/lib\n');

    const mainGitDir = path.join(main, '.git');
    expect(await inspectRepository(main)).toEqual({ kind: 'repository', commonDir: mainGitDir });
    expect(await inspectRepository(worktree)).toEqual({ kind: 'worktree', commonDir: mainGitDir });
    expect(await inspectRepository(submodule)).toEqual({
      kind: 'submodule',
      commonDir: path.join(mainGitDir, 'modules', 'lib'),
    });
  });
});

describe('findRepositoryRoot', () => {
  it('finds the nearest working tree on disk, so a nested worktree owns itself', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'sieve-roots-'));
    temporaryPaths.push(root);
    const main = path.join(root, 'main');
    const nested = path.join(main, '.worktrees', 'fix');
    await fs.mkdir(path.join(main, '.git'), { recursive: true });
    await fs.mkdir(path.join(main, 'packages', 'web'), { recursive: true });
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(nested, '.git'), 'gitdir: ../../.git/worktrees/fix\n');

    expect(await findRepositoryRoot(path.join(main, 'packages', 'web'))).toBe(main);
    expect(await findRepositoryRoot(nested)).toBe(nested);
    expect(await findRepositoryRoot(path.join(nested, 'src'))).toBe(nested);
  });
});

describe('selectRepositories', () => {
  const main = repo('/code/app', 'repository', '/code/app/.git');
  const sibling = repo('/code/app-feature', 'worktree', '/code/app/.git');
  const nested = repo('/code/app/.worktrees/fix', 'worktree', '/code/app/.git');
  const submodule = repo('/code/app/vendor/lib', 'submodule', '/code/app/.git/modules/lib');
  const unrelated = repo('/other/tool', 'repository', '/other/tool/.git');

  it('keeps a repository and its worktrees opened as workspace folders, in folder order', () => {
    expect(selectRepositories([main, sibling], ['/code/app-feature', '/code/app'])).toEqual([sibling, main]);
  });

  it('adds worktrees inside a workspace folder but leaves submodules to their superproject', () => {
    expect(selectRepositories([submodule, nested, main], ['/code/app'])).toEqual([main, nested]);
  });

  it('adds worktrees Git found elsewhere for a reviewed repository', () => {
    expect(selectRepositories([sibling, main, unrelated], ['/code/app'])).toEqual([main, sibling]);
  });

  it('reviews a submodule that is itself opened as a workspace folder', () => {
    expect(selectRepositories([main, submodule], ['/code/app/vendor/lib'])).toEqual([submodule]);
  });

  it('uses the innermost repository holding a workspace folder', () => {
    expect(selectRepositories([main], ['/code/app/packages/web'])).toEqual([main]);
    expect(selectRepositories([main, nested], ['/code/app/.worktrees/fix'])).toEqual([nested, main]);
  });

  it('ignores unrelated repositories outside the workspace', () => {
    expect(selectRepositories([main, unrelated], ['/code/app'])).toEqual([main]);
  });
});

describe('samePath', () => {
  it('ignores trailing separators and redundant segments', () => {
    expect(samePath('/code/app/', '/code/app')).toBe(true);
    expect(samePath('/code/app/src/..', '/code/app')).toBe(true);
    expect(samePath('/code/app', '/code/app-feature')).toBe(false);
  });
});

describe('isWithin', () => {
  it('matches the folder itself and its descendants only', () => {
    expect(isWithin('/code/app', '/code/app')).toBe(true);
    expect(isWithin('/code/app/src', '/code/app')).toBe(true);
    expect(isWithin('/code/app/..cache', '/code/app')).toBe(true);
    expect(isWithin('/code/app-feature', '/code/app')).toBe(false);
    expect(isWithin('/code', '/code/app')).toBe(false);
  });
});

function repo(root: string, kind: RepositoryCandidate['kind'], commonDir: string): RepositoryCandidate {
  return { root: path.resolve(root), kind, commonDir: path.resolve(commonDir) };
}
