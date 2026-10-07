import type { Ref } from '../git';
import { RefType } from '../git';

export type RefKind = 'branch' | 'remote' | 'tag';

/** A branch, remote branch, or tag offered by the comparison pickers. */
export interface RefChoice {
  readonly name: string;
  readonly kind: RefKind;
  readonly commit: string | undefined;
  /** True for the branch checked out in the working tree. */
  readonly current: boolean;
}

const KIND: Record<RefType, RefKind> = {
  [RefType.Head]: 'branch',
  [RefType.RemoteHead]: 'remote',
  [RefType.Tag]: 'tag',
};

const RANK: Record<RefKind, number> = { branch: 1, remote: 2, tag: 3 };

/**
 * Orders refs for the comparison pickers: the current branch first, then local
 * branches, remote branches, and tags. Each group keeps the order Git returned
 * them in, so most recently committed refs stay on top.
 */
export function toRefChoices(refs: readonly Ref[], currentBranch: string | undefined): RefChoice[] {
  const seen = new Set<string>();
  const choices: RefChoice[] = [];
  for (const ref of refs) {
    if (!ref.name || seen.has(ref.name)) continue;
    seen.add(ref.name);
    const kind = KIND[ref.type ?? RefType.Head];
    choices.push({
      name: ref.name,
      kind,
      commit: ref.commit,
      current: kind === 'branch' && ref.name === currentBranch,
    });
  }
  return choices.sort((a, b) => rank(a) - rank(b));
}

function rank(choice: RefChoice): number {
  return choice.current ? 0 : RANK[choice.kind];
}
