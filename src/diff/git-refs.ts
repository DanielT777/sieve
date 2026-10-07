import type { Branch, Ref } from '../git';
import { RefType } from '../git';

export type RefKind = 'head' | 'branch' | 'remote' | 'tag';

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

const RANK: Record<RefKind, number> = { head: 0, branch: 1, remote: 2, tag: 3 };

/**
 * Orders refs for the comparison pickers: the current branch first (or `HEAD`
 * when it is detached), then local branches, remote branches, and tags. Each
 * group keeps the order Git returned them in, so most recently committed refs
 * stay on top.
 */
export function toRefChoices(refs: readonly Ref[], head: Branch | undefined): RefChoice[] {
  const seen = new Set<string>();
  const choices: RefChoice[] = [];
  if (head && !head.name) {
    choices.push({ name: 'HEAD', kind: 'head', commit: head.commit, current: false });
    seen.add('HEAD');
  }
  for (const ref of refs) {
    if (!ref.name || seen.has(ref.name)) continue;
    // `origin/HEAD` only aliases the remote's default branch, which is listed anyway,
    // and would swallow a typed `HEAD`.
    if (ref.type === RefType.RemoteHead && ref.name.endsWith('/HEAD')) continue;
    seen.add(ref.name);
    const kind = KIND[ref.type ?? RefType.Head];
    choices.push({
      name: ref.name,
      kind,
      commit: ref.commit,
      current: kind === 'branch' && ref.name === head?.name,
    });
  }
  return choices.sort((a, b) => rank(a) - rank(b));
}

function rank(choice: RefChoice): number {
  return choice.current ? 0 : RANK[choice.kind];
}
