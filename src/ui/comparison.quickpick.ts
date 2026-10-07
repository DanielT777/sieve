import * as vscode from 'vscode';
import type { SieveSession } from '../shared/sieve.session';
import type { GitDiffProvider } from '../diff/git-diff.provider';
import { pickRef } from './ref.quickpick';
import { pickRepository } from './repository.quickpick';
import { SourceItem } from './source.item';

const RANGE_PLACEHOLDER = 'Search branches and tags, or type a commit — base...target also works';
const REF_PLACEHOLDER = 'Search branches and tags, or type a commit';

/** Picks the base, then the target, of the committed changes section. */
export async function chooseCommittedComparison(session: SieveSession, item?: unknown): Promise<void> {
  await updateComparison(session, item, pickComparison);
}

/** Swaps only the base of the committed comparison. */
export async function changeComparisonBase(session: SieveSession, item?: unknown): Promise<void> {
  await updateComparison(session, item, async diff => {
    const current = diff.getComparison();
    const target = current.target ?? 'HEAD';
    const base = await pickRef({
      title: `Change base (target: ${target})`,
      placeholder: REF_PLACEHOLDER,
      refs: await diff.listRefs(),
      activeRef: current.base,
    });
    if (base?.kind !== 'ref') return false;

    await diff.setComparison(`${base.ref}${current.separator}${target}`);
    return true;
  });
}

/** Swaps only the target of the committed comparison. */
export async function changeComparisonTarget(session: SieveSession, item?: unknown): Promise<void> {
  await updateComparison(session, item, async diff => {
    const current = diff.getComparison();
    if (!current.base) return pickComparison(diff);

    const target = await pickRef({
      title: `Change target (base: ${current.base})`,
      placeholder: REF_PLACEHOLDER,
      refs: await diff.listRefs(),
      activeRef: current.target,
    });
    if (target?.kind !== 'ref') return false;

    await diff.setComparison(`${current.base}${current.separator}${target.ref}`);
    return true;
  });
}

/** Walks the base picker, then the target picker. Returns true when the comparison changed. */
async function pickComparison(diff: GitDiffProvider): Promise<boolean> {
  const refs = await diff.listRefs();
  const current = diff.getComparison();
  let activeBase = current.base;

  for (;;) {
    const base = await pickRef({
      title: 'Compare (1/2): base',
      placeholder: RANGE_PLACEHOLDER,
      refs,
      activeRef: activeBase,
      branchComparison: {
        description: current.target
          ? `Detect the base of ${current.target} automatically`
          : 'Detect the base automatically',
        active: current.mode === 'branch' && activeBase === current.base,
      },
      allowRange: true,
    });
    if (!base || base.kind === 'back') return false;
    if (base.kind === 'branch-comparison') {
      diff.useBranchComparison();
      return true;
    }
    if (base.kind === 'range') {
      await diff.setComparison(base.range);
      return true;
    }
    activeBase = base.ref;

    const target = await pickRef({
      title: `Compare (2/2): ${base.ref}...target`,
      placeholder: REF_PLACEHOLDER,
      refs,
      activeRef: current.target,
      canGoBack: true,
    });
    if (!target) return false;
    if (target.kind !== 'ref') continue;

    await diff.setComparison(`${base.ref}...${target.ref}`);
    return true;
  }
}

/**
 * Runs a comparison change on one repository and reloads the Review Desk when
 * it reports a change. A section clicked in the tree names its repository;
 * otherwise the user picks one when there are several.
 */
async function updateComparison(
  session: SieveSession,
  item: unknown,
  change: (diff: GitDiffProvider) => Promise<boolean>,
): Promise<void> {
  const repository = item instanceof SourceItem
    ? item.repository
    : await pickRepository(session.repositories(), 'Choose the repository whose committed changes to compare');
  if (!repository) return;

  try {
    if (await change(repository.diff)) await session.treeProvider.reload();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Sieve: ${message}`);
  }
}
