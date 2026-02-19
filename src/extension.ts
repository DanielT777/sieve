import * as vscode from 'vscode';
import type { GitExtension, API as GitAPI, Repository } from './git';
import { GitDiffProvider } from './diff/git-diff.provider';
import { TriageManager } from './review/triage.manager';
import { loadTriage, saveTriage } from './review/triage.store';
import { ReviewDeskProvider } from './ui/review-desk.provider';
import { SieveStatusBar } from './ui/status.bar';
import { AnnotationController } from './annotations/annotation.controller';
import { AnnotationStore } from './annotations/annotation.store';
import { ExportService } from './export/export.service';
import { registerCommands } from './commands';
import { logger } from './shared/logger';
import { debounce } from './shared/debounce';
import type { SieveSession } from './shared/sieve.session';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;
  const workspacePath = workspaceFolder.uri.fsPath;

  let session: SieveSession | undefined;
  context.subscriptions.push(...registerCommands(() => session));
  context.subscriptions.push({ dispose: () => logger.dispose() });

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
        session = initSession(context, workspacePath, gitExports.getAPI(1), s => { session = s; });
        disposable.dispose();
      }
    });
    context.subscriptions.push(disposable);
    return;
  }

  session = initSession(context, workspacePath, gitExports.getAPI(1), s => { session = s; });
}

export function deactivate(): void {}

/**
 * Tries to find the repository immediately.
 * Falls back to `onDidOpenRepository` if git hasn't discovered it yet.
 */
function initSession(
  context: vscode.ExtensionContext,
  workspacePath: string,
  gitAPI: GitAPI,
  setSession: (s: SieveSession) => void,
): SieveSession | undefined {
  const repo = gitAPI.getRepository(vscode.Uri.file(workspacePath));
  if (repo) return buildSession(context, workspacePath, repo);

  logger.info('Repo not found yet — waiting for git to discover it.');
  const disposable = gitAPI.onDidOpenRepository(openedRepo => {
    if (openedRepo.rootUri.fsPath === workspacePath) {
      setSession(buildSession(context, workspacePath, openedRepo));
      disposable.dispose();
    }
  });
  context.subscriptions.push(disposable);
  return undefined;
}

function buildSession(
  context: vscode.ExtensionContext,
  workspacePath: string,
  repo: Repository,
): SieveSession {
  const diff = new GitDiffProvider(repo);
  const triage = new TriageManager();
  const annotations = new AnnotationStore(workspacePath);
  const treeProvider = new ReviewDeskProvider(diff, triage);
  const statusBar = new SieveStatusBar();
  const annotationController = new AnnotationController(
    annotations,
    () => treeProvider.getFileUriSet(),
  );
  const exportService = new ExportService(diff, annotations);

  annotationController.setOnAnnotate(fileUri => {
    triage.setState(fileUri, 'flagged');
  });

  const debouncedSave = debounce(() => {
    saveTriage(triage, workspacePath).catch(err => {
      logger.error('Failed to save triage state', err);
    });
  }, 300);

  triage.setOnChange(() => {
    debouncedSave.call();
    statusBar.update(triage.computeStats(treeProvider.getFileUris()));
    treeProvider.refreshTriage();
  });

  const treeView = vscode.window.createTreeView('sieve.reviewDesk', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  const debouncedGitRefresh = debounce(() => treeProvider.refresh(), 300);
  const gitWatcher = diff.watchChanges(() => debouncedGitRefresh.call());
  const visibilityWatcher = treeView.onDidChangeVisibility(e => {
    if (e.visible) treeProvider.refresh();
  });

  Promise.all([
    loadTriage(triage, workspacePath),
    annotations.load(),
  ])
    .then(() => {
      treeProvider.refresh();
      statusBar.update(triage.computeStats(treeProvider.getFileUris()));
      annotationController.restore();
    })
    .catch(err => {
      logger.error('Failed to initialise session data', err);
    });

  context.subscriptions.push(
    treeProvider, statusBar, treeView, gitWatcher, visibilityWatcher, annotationController,
    debouncedSave, debouncedGitRefresh,
  );

  return { treeView, treeProvider, triage, annotations, annotationController, exportService };
}
