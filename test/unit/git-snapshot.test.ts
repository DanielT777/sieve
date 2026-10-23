import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { diffSnapshots, parseNameStatus, snapshotWorkingTree } from '../../src/diff/git-snapshot';
import { GitDiffProvider } from '../../src/diff/git-diff.provider';
import type { Repository } from '../../src/git';

let root: string;

const git = (...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd: root, encoding: 'utf-8',
  });
const write = (file: string, content: string): void => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
};

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'sieve-snapshot-')));
  git('init', '-q');
  write('.gitignore', 'build/\n');
  write('src/app.ts', 'one\ntwo\nthree\n');
  write('src/moved.ts', 'export const moved = true;\n');
  write('src/gone.ts', 'bye\n');
  git('add', '.');
  git('commit', '-qm', 'init');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('snapshotWorkingTree', () => {
  it('keeps untracked files, skips ignored ones, and leaves the index alone', async () => {
    write('src/app.ts', 'one\ntwo\nthree\nfour\n');
    write('src/new.ts', 'new\n');
    write('build/out.js', 'ignored\n');
    git('add', 'src/app.ts');
    const status = git('status', '--porcelain');

    const tree = await snapshotWorkingTree('git', root);

    expect(git('ls-tree', '-r', '--name-only', tree).split('\n').filter(Boolean)).toEqual([
      '.gitignore', 'src/app.ts', 'src/gone.ts', 'src/moved.ts', 'src/new.ts',
    ]);
    expect(git('show', `${tree}:src/new.ts`)).toBe('new\n');
    expect(git('status', '--porcelain')).toBe(status);
  });
});

describe('diffSnapshots', () => {
  it('lists only what changed after the checkpoint, committed or not', async () => {
    write('src/app.ts', 'one\ntwo\nthree\nfour\n');
    write('src/draft.ts', 'draft\n');
    const checkpoint = await snapshotWorkingTree('git', root);

    write('src/app.ts', 'one\nTWO\nthree\nfour\n');
    git('commit', '-qam', 'agent fix');
    write('src/draft.ts', 'draft v2\n');
    write('src/added.ts', 'added\n');
    fs.rmSync(path.join(root, 'src/gone.ts'));
    fs.renameSync(path.join(root, 'src/moved.ts'), path.join(root, 'src/renamed.ts'));
    const now = await snapshotWorkingTree('git', root);

    expect(await diffSnapshots('git', root, checkpoint, now)).toEqual([
      { status: 'added', path: 'src/added.ts', oldPath: undefined },
      { status: 'modified', path: 'src/app.ts', oldPath: undefined },
      { status: 'modified', path: 'src/draft.ts', oldPath: undefined },
      { status: 'deleted', path: 'src/gone.ts', oldPath: undefined },
      { status: 'renamed', path: 'src/renamed.ts', oldPath: 'src/moved.ts' },
    ]);
  });

  it('reads copies, which `diff.renames=copies` reports, as added files', () => {
    expect(parseNameStatus('C75\0a.ts\0b.ts\0M\0c.ts\0')).toEqual([
      { status: 'added', path: 'b.ts', oldPath: undefined },
      { status: 'modified', path: 'c.ts', oldPath: undefined },
    ]);
  });
});

describe('GitDiffProvider checkpoint', () => {
  it('shows a "Since last review" section with only the hunks added after the checkpoint', async () => {
    write('src/app.ts', 'one\ntwo\nthree\nfour\n');
    const provider = new GitDiffProvider(cleanRepo());
    await provider.createCheckpoint();

    expect((await provider.getChangedFiles()).filter(f => f.source?.id === 'checkpoint')).toEqual([]);

    write('src/app.ts', 'one\nTWO\nthree\nfour\n');
    const files = (await provider.getChangedFiles()).filter(f => f.source?.id === 'checkpoint');

    expect(provider.getSources()[0]).toMatchObject({ label: 'Since last review', targetRef: undefined });
    expect(files.map(f => [f.relativePath, f.status, f.uri])).toEqual([
      ['src/app.ts', 'modified', path.join(root, 'src/app.ts')],
    ]);
    const diff = await provider.getDiff(files[0]!);
    expect(diff.hunks.flatMap(h => h.lines.filter(l => l.type !== 'context').map(l => `${l.type} ${l.content}`)))
      .toEqual(['removed two', 'added TWO']);
  });

  it('reports a checkpoint whose snapshot no longer exists instead of failing', async () => {
    const provider = new GitDiffProvider(cleanRepo());
    provider.setCheckpoint({ tree: 'f'.repeat(40), createdAt: 0 });

    await expect(provider.getChangedFiles()).resolves.toEqual([]);
    expect(provider.getSources()[0]!.description).toBe('Checkpoint unavailable — set a new one');
  });
});

/** A repository VS Code reports as clean, on a branch without a base. */
function cleanRepo(): Repository {
  return {
    rootUri: { fsPath: root },
    state: {
      HEAD: undefined,
      remotes: [],
      indexChanges: [],
      workingTreeChanges: [],
      untrackedChanges: [],
      mergeChanges: [],
      onDidChange: () => ({ dispose() {} }),
    },
  } as unknown as Repository;
}
