import * as vscode from 'vscode';
import type { GitExtension, API as GitAPI } from './git';
import { ReviewDeskProvider } from './ui/review-desk.provider';
import { SieveStatusBar } from './ui/status.bar';
import { AnnotationController } from './annotations/annotation.controller';
import { ExportService } from './export/export.service';
import { RepositoryTracker } from './review/repository.tracker';
import { registerCommands } from './commands';
import { logger } from './shared/logger';
import { debounce } from './shared/debounce';
import type { SieveSession } from './shared/sieve.session';
import { reviewKey } from './diff/diff.model';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  let session: SieveSession | undefined;
  context.subscriptions.push(...registerCommands(context, () => session));
  context.subscriptions.push({ dispose: () => logger.dispose() });

  if (!vscode.workspace.workspaceFolders?.length) return;

  const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!gitExtension) {
    logger.warn('Git extension not found — Sieve cannot start.');
    return;
  }

  // Ensure the git extension is activated before accessing exports.
  if (!gitExtension.isActive) {
    await gitExtension.activate();
  }

  const gitExports = gitExtension.exports;
  if (!gitExports.enabled) {
    const disposable = gitExports.onDidChangeEnablement(enabled => {
      if (enabled) {
        session = buildSession(context, gitExports.getAPI(1));
        disposable.dispose();
      }
    });
    context.subscriptions.push(disposable);
    return;
  }

  session = buildSession(context, gitExports.getAPI(1));
}

export function deactivate(): void {}

/**
 * Wires the Review Desk to every repository in the workspace. Repositories
 * appear as Git discovers them, so a repository and its worktrees opened side
 * by side are all reviewed.
 */
function buildSession(context: vscode.ExtensionContext, gitAPI: GitAPI): SieveSession {
  const repositories = new RepositoryTracker(gitAPI);
  const treeProvider = new ReviewDeskProvider(() => repositories.all);
  const statusBar = new SieveStatusBar();
  const annotationController = new AnnotationController(treeProvider);
  const exportService = new ExportService(() => repositories.all);

  annotationController.setOnAnnotate(({ repository, file }) => {
    repository.triage.setState(reviewKey(file), 'flagged');
  });

  treeProvider.setOnFilesChanged(() => {
    statusBar.update(treeProvider.computeStats());
    annotationController.restore();
  });

  const reload = (): void => {
    treeProvider.reload().catch(err => {
      logger.error('Failed to load changed files', err);
    });
  };

  const treeView = vscode.window.createTreeView('sieve.reviewDesk', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  const debouncedGitRefresh = debounce(() => treeProvider.refresh(), 300);
  const subscriptions = [
    repositories.onDidChange(reload),
    repositories.onDidChangeGitState(() => debouncedGitRefresh.call()),
    repositories.onDidChangeTriage(() => {
      statusBar.update(treeProvider.computeStats());
      treeProvider.refreshTriage();
    }),
    treeView.onDidChangeVisibility(e => {
      if (e.visible) treeProvider.refresh();
    }),
  ];

  void repositories.refresh();

  context.subscriptions.push(
    repositories, treeProvider, statusBar, treeView, annotationController,
    debouncedGitRefresh, ...subscriptions,
  );

  return {
    treeView,
    treeProvider,
    annotationController,
    exportService,
    repositories: () => repositories.all,
  };
}
