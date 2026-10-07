import { describe, expect, it } from 'vitest';
import { toRefChoices } from '../../src/diff/git-refs';
import { RefType } from '../../src/git';

describe('toRefChoices', () => {
  it('puts the current branch first, then branches, remote branches, and tags', () => {
    const choices = toRefChoices([
      { type: RefType.Tag, name: 'v1.0.0', commit: 'aaa' },
      { type: RefType.RemoteHead, name: 'origin/main', commit: 'bbb', remote: 'origin' },
      { type: RefType.Head, name: 'main', commit: 'ccc' },
      { type: RefType.Head, name: 'feature/very-long-branch-name', commit: 'ddd' },
      { type: RefType.Head, name: 'fix/other', commit: 'eee' },
    ], { name: 'feature/very-long-branch-name' });

    expect(choices.map(choice => [choice.name, choice.kind, choice.current])).toEqual([
      ['feature/very-long-branch-name', 'branch', true],
      ['main', 'branch', false],
      ['fix/other', 'branch', false],
      ['origin/main', 'remote', false],
      ['v1.0.0', 'tag', false],
    ]);
  });

  it('keeps Git order within a group and drops unnamed or duplicate refs', () => {
    const choices = toRefChoices([
      { type: RefType.Head, name: 'recent' },
      { type: RefType.Head },
      { type: RefType.Head, name: 'older' },
      { type: RefType.Head, name: 'recent' },
    ], undefined);

    expect(choices.map(choice => choice.name)).toEqual(['recent', 'older']);
  });

  it('never marks a remote branch as current', () => {
    const [choice] = toRefChoices([{ type: RefType.RemoteHead, name: 'main' }], { name: 'main' });
    expect(choice?.current).toBe(false);
  });

  it('leaves out remote HEAD aliases so a typed HEAD is not swallowed by origin/HEAD', () => {
    const choices = toRefChoices([
      { type: RefType.RemoteHead, name: 'origin/HEAD', remote: 'origin' },
      { type: RefType.RemoteHead, name: 'origin/main', remote: 'origin' },
    ], { name: 'main' });

    expect(choices.map(choice => choice.name)).toEqual(['origin/main']);
  });

  it('offers HEAD first when no branch is checked out', () => {
    const choices = toRefChoices([{ type: RefType.Head, name: 'main', commit: 'aaa' }], { commit: 'bbb' });

    expect(choices.map(choice => [choice.name, choice.kind, choice.commit])).toEqual([
      ['HEAD', 'head', 'bbb'],
      ['main', 'branch', 'aaa'],
    ]);
  });
});
