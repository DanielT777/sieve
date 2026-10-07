import * as vscode from 'vscode';
import type { SieveSession } from '../shared/sieve.session';
import type { GitDiffProvider } from '../diff/git-diff.provider';
import { pickRef } from './ref.quickpick';

const RANGE_PLACEHOLDER = 'Search branches and tags, or type a commit — base...target also works';
const REF_PLACEHOLDER = 'Search branches and tags, or type a commit';

/** Picks the base, then the target, of the committed changes section. */
export async function chooseCommittedComparison(session: SieveSession): Promise<void> {
  await updateComparison(session, async diff => {
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
  });
}

/** Swaps only the base of the committed comparison. */
export async function changeComparisonBase(session: SieveSession): Promise<void> {
  await updateComparison(session, async diff => {
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
export async function changeComparisonTarget(session: SieveSession): Promise<void> {
  if (!session.diff.getComparison().base) return chooseCommittedComparison(session);

  await updateComparison(session, async diff => {
    const current = diff.getComparison();
    const base = current.base ?? 'HEAD';
    const target = await pickRef({
      title: `Change target (base: ${base})`,
      placeholder: REF_PLACEHOLDER,
      refs: await diff.listRefs(),
      activeRef: current.target,
    });
    if (target?.kind !== 'ref') return false;

    await diff.setComparison(`${base}${current.separator}${target.ref}`);
    return true;
  });
}

/** Runs a comparison change and reloads the Review Desk when it reports a change. */
async function updateComparison(
  session: SieveSession,
  change: (diff: GitDiffProvider) => Promise<boolean>,
): Promise<void> {
  try {
    if (await change(session.diff)) await session.treeProvider.reload();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Sieve: ${message}`);
  }
}
