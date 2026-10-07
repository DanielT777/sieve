import * as vscode from 'vscode';
import type { SieveSession } from '../shared/sieve.session';
import { pickRepository } from './repository.quickpick';

export async function chooseCommittedComparison(session: SieveSession): Promise<void> {
  const repository = await pickRepository(
    session.repositories(),
    'Choose the repository whose committed changes to compare',
  );
  if (!repository) return;

  const picked = await vscode.window.showQuickPick([
    {
      label: '$(git-branch) Committed on this branch',
      description: 'Compare the current branch with its merge base',
      mode: 'branch' as const,
    },
    {
      label: '$(git-compare) Compare branches or commits…',
      description: 'Use base...target (merge-base) or base..target (direct)',
      mode: 'refs' as const,
    },
  ], { placeHolder: 'Choose what appears in the committed changes section' });
  if (!picked) return;

  try {
    if (picked.mode === 'branch') {
      repository.diff.useBranchComparison();
    } else {
      const current = repository.diff.getSources()[0]?.description;
      const spec = await vscode.window.showInputBox({
        prompt: 'Compare Git branches, tags, or commits',
        placeHolder: 'main...HEAD',
        value: current && /^\S+\.\.\.\S+$/.test(current) ? current : 'main...HEAD',
      });
      if (!spec) return;
      await repository.diff.setComparison(spec);
    }

    await session.treeProvider.reload();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Sieve: ${message}`);
  }
}
