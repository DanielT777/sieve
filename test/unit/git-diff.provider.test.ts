import { describe, expect, it, vi } from 'vitest';
import { GitDiffProvider } from '../../src/diff/git-diff.provider';
import { RefType, Status, type Change, type Repository } from '../../src/git';
import { reviewKey } from '../../src/diff/diff.model';

const committedChange = change('/workspace/src/shared.ts', Status.INDEX_MODIFIED);
const workingChange = change('/workspace/src/shared.ts', Status.UNTRACKED);

describe('GitDiffProvider comparisons', () => {
  it('keeps committed branch changes separate from current changes', async () => {
    const diffBetween = vi.fn(async (_base: string, _target: string, file?: string) =>
      file ? '@@ -1 +1 @@\n-old\n+new' : [committedChange],
    );
    const repo = {
      rootUri: { fsPath: '/workspace' },
      state: {
        HEAD: { name: 'feature', upstream: { remote: 'origin', name: 'origin/feature' } },
        remotes: [{ name: 'origin' }],
        indexChanges: [],
        workingTreeChanges: [],
        untrackedChanges: [workingChange],
        mergeChanges: [],
        onDidChange: vi.fn(),
      },
      getBranchBase: vi.fn(async () => ({ name: 'origin/feature' })),
      getBranches: vi.fn(async ({ remote }: { remote?: boolean }) =>
        remote ? [{ name: 'origin/main' }] : [{ name: 'feature' }, { name: 'main' }],
      ),
      getMergeBase: vi.fn(async () => 'base-sha'),
      diffBetween,
      diffWithHEAD: vi.fn(async () => ''),
      getCommit: vi.fn(async (ref: string) => ({ hash: `${ref}-sha` })),
      show: vi.fn(async () => 'new'),
    } as unknown as Repository;

    const provider = new GitDiffProvider(repo);
    const files = await provider.getChangedFiles();

    expect(files.map(file => [file.relativePath, file.source?.label])).toEqual([
      ['src/shared.ts', 'Committed on this branch'],
      ['src/shared.ts', 'Current changes'],
    ]);
    expect(reviewKey(files[0]!)).not.toBe(reviewKey(files[1]!));
    expect(diffBetween).toHaveBeenCalledWith('base-sha', 'HEAD');

    diffBetween.mockClear();
    await provider.setComparison('release...feature');
    await provider.getChangedFiles();
    expect(provider.getSources()[0]!.description).toBe('release...feature');
    expect(diffBetween).toHaveBeenCalledWith('base-sha', 'feature-sha');
  });
});

describe('GitDiffProvider custom comparisons', () => {
  it('re-resolves branch names on every refresh so new commits appear', async () => {
    let featureTip = 'tip-1';
    const repo = fakeRepo({
      getCommit: vi.fn(async (ref: string) => ({ hash: ref === 'feature' ? featureTip : `${ref}-sha` })),
    });
    const provider = new GitDiffProvider(repo);

    await provider.setComparison('main...feature');
    await provider.getChangedFiles();
    expect(repo.diffBetween).toHaveBeenLastCalledWith('base-sha', 'tip-1');

    featureTip = 'tip-2';
    await provider.getChangedFiles();
    expect(repo.diffBetween).toHaveBeenLastCalledWith('base-sha', 'tip-2');
    expect(provider.getSources()[0]!.id).toBe('compare:main...feature');
  });

  it('shows an empty section instead of failing when a chosen ref disappears', async () => {
    let branchExists = true;
    const repo = fakeRepo({
      getCommit: vi.fn(async (ref: string) => {
        if (ref === 'gone' && !branchExists) throw new Error('unknown revision gone');
        return { hash: `${ref}-sha` };
      }),
    });
    const provider = new GitDiffProvider(repo);
    await provider.setComparison('main...gone');

    branchExists = false;
    const files = await provider.getChangedFiles();

    expect(provider.getSources()[0]!.description).toBe('Cannot resolve main...gone');
    expect(files.filter(file => file.source?.id !== 'working-tree')).toEqual([]);
  });

  it('rejects refs that cannot be resolved when the comparison is chosen', async () => {
    const repo = fakeRepo({
      getCommit: vi.fn(async (ref: string) => {
        if (ref === 'typo') throw new Error('unknown revision typo');
        return { hash: `${ref}-sha` };
      }),
    });
    const provider = new GitDiffProvider(repo);

    await expect(provider.setComparison('typo...feature')).rejects.toThrow('unknown revision typo');
    await provider.getChangedFiles();
    expect(provider.getComparison().mode).toBe('branch');
  });

  it('reports the refs behind the committed section for both modes', async () => {
    const provider = new GitDiffProvider(fakeRepo());

    await provider.getChangedFiles();
    expect(provider.getComparison()).toEqual({
      mode: 'branch', base: 'origin/main', target: 'feature', separator: '...',
    });

    await provider.setComparison('v1.0..feature');
    await provider.getChangedFiles();
    expect(provider.getComparison()).toEqual({
      mode: 'custom', base: 'v1.0', target: 'feature', separator: '..',
    });

    provider.useBranchComparison();
    await provider.getChangedFiles();
    expect(provider.getComparison().mode).toBe('branch');
  });

  it('lists refs most recently committed first, with the current branch on top', async () => {
    const repo = fakeRepo({
      getRefs: vi.fn(async () => [
        { type: RefType.Head, name: 'main' },
        { type: RefType.Head, name: 'feature' },
      ]),
    });
    const provider = new GitDiffProvider(repo);

    const refs = await provider.listRefs();

    expect(repo.getRefs).toHaveBeenCalledWith({ sort: 'committerdate' });
    expect(refs.map(ref => ref.name)).toEqual(['feature', 'main']);
  });
});

function fakeRepo(overrides: Partial<Record<keyof Repository, unknown>> = {}): Repository {
  return {
    rootUri: { fsPath: '/workspace' },
    state: {
      HEAD: { name: 'feature', upstream: { remote: 'origin', name: 'origin/feature' } },
      remotes: [{ name: 'origin' }],
      indexChanges: [],
      workingTreeChanges: [],
      untrackedChanges: [],
      mergeChanges: [],
      onDidChange: vi.fn(),
    },
    getBranchBase: vi.fn(async () => undefined),
    getBranches: vi.fn(async () => [{ name: 'feature' }, { name: 'origin/main' }]),
    getRefs: vi.fn(async () => []),
    getMergeBase: vi.fn(async () => 'base-sha'),
    diffBetween: vi.fn(async (_base: string, _target: string, file?: string) => file ? '' : [committedChange]),
    diffWithHEAD: vi.fn(async () => ''),
    getCommit: vi.fn(async (ref: string) => ({ hash: `${ref}-sha` })),
    show: vi.fn(async () => ''),
    ...overrides,
  } as unknown as Repository;
}

function change(fsPath: string, status: Status): Change {
  const uri = { fsPath } as Change['uri'];
  return { uri, originalUri: uri, renameUri: undefined, status };
}
