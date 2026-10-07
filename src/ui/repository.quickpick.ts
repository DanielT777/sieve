import * as vscode from 'vscode';
import type { ReviewRepository } from '../review/review.repository';
import { branchLabel, repositoryIcon } from './repository.item';

/** Returns the only repository, or asks which one when there are several. */
export async function pickRepository(
  repositories: readonly ReviewRepository[],
  placeHolder: string,
): Promise<ReviewRepository | undefined> {
  if (repositories.length <= 1) return repositories[0];

  const picked = await vscode.window.showQuickPick(
    repositories.map(repository => ({
      label: repository.label,
      iconPath: repositoryIcon(repository),
      description: branchLabel(repository),
      detail: repository.root,
      repository,
    })),
    { placeHolder },
  );
  return picked?.repository;
}
