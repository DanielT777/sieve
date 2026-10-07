import * as vscode from 'vscode';
import type { ReviewRepository } from '../review/review.repository';
import type { ReviewDeskItem } from './review-desk.items';

/** Top-level node shown when the workspace holds several repositories or worktrees. */
export class RepositoryItem extends vscode.TreeItem {
  constructor(
    readonly repository: ReviewRepository,
    readonly children: ReviewDeskItem[],
  ) {
    super(repository.label, vscode.TreeItemCollapsibleState.Expanded);
    this.description = branchLabel(repository);
    this.tooltip = repository.kind === 'worktree'
      ? `${repository.root} (worktree)`
      : repository.root;
    this.iconPath = repositoryIcon(repository);
    this.contextValue = 'repository';
  }
}

export function repositoryIcon(repository: ReviewRepository): vscode.ThemeIcon {
  return new vscode.ThemeIcon(repository.kind === 'worktree' ? 'git-branch' : 'repo');
}

export function branchLabel(repository: ReviewRepository): string {
  const head = repository.git.state.HEAD;
  return head?.name ?? head?.commit?.slice(0, 8) ?? 'detached HEAD';
}
