import * as vscode from 'vscode';
import type { RefChoice, RefKind } from '../diff/git-refs';

/** What the user chose in a ref picker. */
export type RefPick =
  | { readonly kind: 'ref'; readonly ref: string }
  | { readonly kind: 'range'; readonly range: string }
  | { readonly kind: 'branch-comparison' }
  | { readonly kind: 'back' };

export interface RefPickOptions {
  readonly title: string;
  readonly placeholder: string;
  readonly refs: readonly RefChoice[];
  /** Ref to highlight when the picker opens. */
  readonly activeRef?: string;
  /** Adds an entry that restores the automatic branch comparison. */
  readonly branchComparison?: { readonly description: string; readonly active: boolean };
  /** Accepts a typed `base...target` or `base..target` range. */
  readonly allowRange?: boolean;
  readonly canGoBack?: boolean;
}

interface RefItem extends vscode.QuickPickItem {
  readonly pick?: RefPick;
}

const ICON: Record<RefKind, string> = { head: 'git-commit', branch: 'git-branch', remote: 'cloud', tag: 'tag' };
const GROUP: Record<RefKind, string> = {
  head: 'Detached HEAD',
  branch: 'Branches',
  remote: 'Remote branches',
  tag: 'Tags',
};

/**
 * Fuzzy picker over branches, remote branches, and tags. Anything Git can
 * resolve (a commit SHA, `HEAD~3`, …) can be typed when no ref matches.
 */
export function pickRef(options: RefPickOptions): Promise<RefPick | undefined> {
  const quickPick = vscode.window.createQuickPick<RefItem>();
  quickPick.title = options.title;
  quickPick.placeholder = options.placeholder;
  quickPick.matchOnDescription = true;
  if (options.canGoBack) quickPick.buttons = [vscode.QuickInputButtons.Back];

  const items = buildItems(options);
  quickPick.items = items;
  const active = items.find(item =>
    options.branchComparison?.active
      ? item.pick?.kind === 'branch-comparison'
      : item.pick?.kind === 'ref' && item.pick.ref === options.activeRef,
  );
  if (active) quickPick.activeItems = [active];

  return new Promise(resolve => {
    let result: RefPick | undefined;
    const finish = (pick: RefPick | undefined): void => {
      result = pick;
      quickPick.hide();
    };

    quickPick.onDidChangeValue(value => {
      const typed = typedItem(value.trim(), options);
      quickPick.items = typed ? [...items, typed] : items;
    });
    quickPick.onDidAccept(() => {
      const value = quickPick.value.trim();
      const pick = quickPick.selectedItems[0]?.pick ?? (value ? typedPick(value, options) : undefined);
      if (pick) finish(pick);
    });
    quickPick.onDidTriggerButton(button => {
      if (button === vscode.QuickInputButtons.Back) finish({ kind: 'back' });
    });
    quickPick.onDidHide(() => {
      quickPick.dispose();
      resolve(result);
    });
    quickPick.show();
  });
}

function buildItems(options: RefPickOptions): RefItem[] {
  const items: RefItem[] = [];
  if (options.branchComparison) {
    items.push({
      label: '$(git-branch) Committed on this branch',
      description: options.branchComparison.description,
      pick: { kind: 'branch-comparison' },
    });
  }

  let group: string | undefined;
  for (const ref of options.refs) {
    const refGroup = ref.current ? 'Current branch' : GROUP[ref.kind];
    if (refGroup !== group) {
      items.push({ label: refGroup, kind: vscode.QuickPickItemKind.Separator });
      group = refGroup;
    }
    items.push({
      label: `$(${ICON[ref.kind]}) ${ref.name}`,
      description: ref.commit?.slice(0, 8),
      pick: { kind: 'ref', ref: ref.name },
    });
  }
  return items;
}

/** Offers the typed text as-is when no listed ref could match it. */
function typedItem(value: string, options: RefPickOptions): RefItem | undefined {
  if (!value || options.refs.some(ref => isSubsequence(value, ref.name))) return undefined;
  const pick = typedPick(value, options);
  return pick.kind === 'range'
    ? { label: `$(git-compare) Compare ${value}`, description: 'Typed range', alwaysShow: true, pick }
    : { label: `$(edit) Use ${value}`, description: 'Typed commit or revision', alwaysShow: true, pick };
}

function typedPick(value: string, options: RefPickOptions): RefPick {
  return options.allowRange && value.includes('..')
    ? { kind: 'range', range: value }
    : { kind: 'ref', ref: value };
}

function isSubsequence(query: string, target: string): boolean {
  const haystack = target.toLowerCase();
  let index = 0;
  for (const char of query.toLowerCase()) {
    index = haystack.indexOf(char, index) + 1;
    if (index === 0) return false;
  }
  return true;
}
