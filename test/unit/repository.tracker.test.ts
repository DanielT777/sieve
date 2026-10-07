import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositoryTracker } from '../../src/review/repository.tracker';
import { workspaceStoragePath } from '../../src/shared/workspace-storage';
import type { API, Repository } from '../../src/git';
import { EventEmitter, workspace } from '../mocks/vscode';

let root: string;
const originalHome = process.env.HOME;
const trackers: RepositoryTracker[] = [];

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), 'sieve-tracker-'));
  process.env.HOME = path.join(root, 'home');
});

afterEach(async () => {
  for (const tracker of trackers.splice(0)) tracker.dispose();
  process.env.HOME = originalHome;
  workspace.workspaceFolders = undefined;
  await fs.rm(root, { recursive: true, force: true });
});

describe('RepositoryTracker', () => {
  it('keeps each repository, and the comparison chosen for it, when Git hands out new objects', async () => {
    const app = await checkout('app');
    const git = fakeGit([app]);
    const tracker = track(git.api, [app]);
    await tracker.refresh();
    const [first] = tracker.all;
    await first!.diff.setComparison('release...feature');

    // A worktree folder is added and Git opens its repository.
    const worktree = await checkout('app-feature');
    workspace.workspaceFolders = folders([app, worktree]);
    git.open(worktree);
    await tracker.refresh();

    expect(tracker.all).toHaveLength(2);
    expect(tracker.all[0]).toBe(first);
    await first!.diff.getChangedFiles();
    expect(first!.diff.getSources()[0]!.description).toBe('release...feature');
  });

  it('writes a pending triage change when its repository closes', async () => {
    const app = await checkout('app');
    const git = fakeGit([app]);
    const tracker = track(git.api, [app]);
    await tracker.refresh();
    tracker.all[0]!.triage.setState(path.join(app, 'src/a.ts'), 'reviewed');

    git.close(app);
    await tracker.refresh();

    expect(tracker.all).toHaveLength(0);
    await vi.waitFor(async () => {
      const saved = JSON.parse(await fs.readFile(path.join(workspaceStoragePath(app), 'triage.json'), 'utf-8'));
      expect(saved).toEqual({ [path.join(app, 'src/a.ts')]: 'reviewed' });
    });
  });

  it('gives a repository that Git closed and reopened at the same root fresh handles', async () => {
    const app = await checkout('app');
    const git = fakeGit([app]);
    const tracker = track(git.api, [app]);
    await tracker.refresh();
    const [first] = tracker.all;

    git.close(app);
    git.open(app);
    await tracker.refresh();

    expect(tracker.all).toHaveLength(1);
    expect(tracker.all[0]).not.toBe(first);
  });

  it('leaves a nested worktree\'s review alone while only the repository around it is open', async () => {
    const app = await checkout('app');
    const nested = path.join(app, '.worktrees', 'fix');
    await fs.mkdir(nested, { recursive: true });
    await fs.writeFile(path.join(nested, '.git'), `gitdir: ${path.join(app, '.git', 'worktrees', 'fix')}\n`);
    const nestedState = path.join(workspaceStoragePath(nested), 'annotations.json');
    await fs.mkdir(path.dirname(nestedState), { recursive: true });
    await fs.writeFile(nestedState, '[]');

    // Both are workspace folders, but Git has only opened the outer repository so far.
    const tracker = track(fakeGit([app]).api, [app, nested]);
    await tracker.refresh();

    await expect(fs.readFile(nestedState, 'utf-8')).resolves.toBe('[]');
    await expect(fs.stat(path.join(workspaceStoragePath(app), 'annotations.json')))
      .rejects.toMatchObject({ code: 'ENOENT' });
  });
});

function track(api: API, workspaceRoots: string[]): RepositoryTracker {
  workspace.workspaceFolders = folders(workspaceRoots);
  const tracker = new RepositoryTracker(api);
  trackers.push(tracker);
  return tracker;
}

async function checkout(name: string): Promise<string> {
  const dir = path.join(root, name);
  await fs.mkdir(path.join(dir, '.git'), { recursive: true });
  return dir;
}

function folders(roots: string[]): { uri: { fsPath: string }; name: string }[] {
  return roots.map(fsPath => ({ uri: { fsPath }, name: path.basename(fsPath) }));
}

/** Mirrors VS Code's git API, which wraps its repositories in new objects on every access. */
function fakeGit(initialRoots: string[]) {
  const roots = [...initialRoots];
  const opened = new EventEmitter<Repository>();
  const closed = new EventEmitter<Repository>();
  const wrap = (fsPath: string): Repository => ({
    rootUri: { fsPath },
    state: {
      HEAD: { name: 'feature' },
      remotes: [],
      indexChanges: [],
      workingTreeChanges: [],
      untrackedChanges: [],
      mergeChanges: [],
      onDidChange: () => ({ dispose() {} }),
    },
    getCommit: async (ref: string) => ({ hash: `${ref}-sha` }),
    getMergeBase: async () => 'merge-base',
    diffBetween: async () => [],
  } as unknown as Repository);

  const api = {
    get repositories() { return roots.map(wrap); },
    onDidOpenRepository: opened.event,
    onDidCloseRepository: closed.event,
    // Like VS Code: the innermost open repository containing the path.
    getRepository: (uri: { fsPath: string }) => {
      const owner = roots
        .filter(fsPath => uri.fsPath === fsPath || uri.fsPath.startsWith(fsPath + path.sep))
        .sort((a, b) => b.length - a.length)[0];
      return owner ? wrap(owner) : null;
    },
  } as unknown as API;

  return {
    api,
    open(fsPath: string) {
      roots.push(fsPath);
      opened.fire(wrap(fsPath));
    },
    close(fsPath: string) {
      roots.splice(roots.indexOf(fsPath), 1);
      closed.fire(wrap(fsPath));
    },
  };
}
