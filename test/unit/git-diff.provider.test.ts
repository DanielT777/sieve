import { describe, expect, it, vi } from 'vitest';
import { GitDiffProvider } from '../../src/diff/git-diff.provider';
import { Status, type Change, type Repository } from '../../src/git';
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

function change(fsPath: string, status: Status): Change {
  const uri = { fsPath } as Change['uri'];
  return { uri, originalUri: uri, renameUri: undefined, status };
}
