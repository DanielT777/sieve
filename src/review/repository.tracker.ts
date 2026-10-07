import * as path from 'path';
import * as vscode from 'vscode';
import type { API as GitAPI, Repository } from '../git';
import { GitDiffProvider } from '../diff/git-diff.provider';
import { AnnotationStore } from '../annotations/annotation.store';
import { TriageManager } from './triage.manager';
import { loadTriage, saveTriage } from './triage.store';
import type { ReviewRepository } from './review.repository';
import {
  findRepositoryRoot,
  inspectRepository,
  samePath,
  selectRepositories,
  type RepositoryKind,
} from './repository.discovery';
import { prepareWorkspaceStorage, workspaceStoragePath } from '../shared/workspace-storage';
import { SIEVE_DIR } from '../shared/config';
import { debounce } from '../shared/debounce';
import { logger } from '../shared/logger';

interface OpenRepository {
  readonly repository: ReviewRepository;
  readonly subscriptions: vscode.Disposable;
}

/**
 * Keeps the reviewed repositories in sync with the repositories Git has open
 * and the workspace folders — e.g. a repository and its worktrees opened side
 * by side. Each repository loads and saves its own review state.
 */
export class RepositoryTracker implements vscode.Disposable {
  private _open: readonly OpenRepository[] = [];
  private _closedRoots = new Set<string>();
  private _queue: Promise<void> = Promise.resolve();

  private readonly _onDidChange = new vscode.EventEmitter<void>();
  /** Fires when repositories are added or removed. */
  readonly onDidChange = this._onDidChange.event;
  private readonly _onDidChangeTriage = new vscode.EventEmitter<ReviewRepository>();
  readonly onDidChangeTriage = this._onDidChangeTriage.event;
  private readonly _onDidChangeGitState = new vscode.EventEmitter<ReviewRepository>();
  readonly onDidChangeGitState = this._onDidChangeGitState.event;

  private readonly _subscriptions: vscode.Disposable[];

  constructor(private readonly _git: GitAPI) {
    const refresh = (): void => void this.refresh();
    this._subscriptions = [
      _git.onDidOpenRepository(refresh),
      _git.onDidCloseRepository(closed => {
        // If Git reopens this root before the next sync, it still needs fresh handles.
        this._closedRoots.add(closed.rootUri.fsPath);
        refresh();
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(refresh),
    ];
  }

  get all(): readonly ReviewRepository[] {
    return this._open.map(open => open.repository);
  }

  /** Re-reads the repositories to review. Calls are queued and never overlap. */
  refresh(): Promise<void> {
    this._queue = this._queue
      .then(() => this._sync())
      .catch(err => logger.error('Failed to update the reviewed repositories', err));
    return this._queue;
  }

  dispose(): void {
    for (const open of this._open) open.subscriptions.dispose();
    this._open = [];
    for (const subscription of this._subscriptions) subscription.dispose();
    this._onDidChange.dispose();
    this._onDidChangeTriage.dispose();
    this._onDidChangeGitState.dispose();
  }

  private async _sync(): Promise<void> {
    const folders = (vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.fsPath);
    const candidates = await Promise.all(this._git.repositories.map(async git => ({
      git,
      root: git.rootUri.fsPath,
      ...await inspectRepository(git.rootUri.fsPath),
    })));

    const closedRoots = [...this._closedRoots];
    this._closedRoots.clear();

    // The git API hands out new Repository objects on every access, so open
    // repositories are recognised by root, keeping their comparison and state.
    const next: OpenRepository[] = [];
    for (const candidate of selectRepositories(candidates, folders)) {
      const existing = closedRoots.some(root => samePath(root, candidate.root))
        ? undefined
        : this._open.find(open => samePath(open.repository.root, candidate.root));
      next.push(existing ?? await this._openRepository(candidate.git, candidate.kind, folders));
    }

    const previous = this._open;
    this._open = next;
    for (const open of previous) {
      if (!next.includes(open)) open.subscriptions.dispose();
    }
    if (next.length !== previous.length || next.some((open, index) => open !== previous[index])) {
      this._onDidChange.fire();
    }
  }

  private async _openRepository(
    git: Repository,
    kind: RepositoryKind,
    folders: readonly string[],
  ): Promise<OpenRepository> {
    const root = git.rootUri.fsPath;
    const storagePath = workspaceStoragePath(root);
    const triage = new TriageManager();
    const annotations = new AnnotationStore(storagePath);
    const repository: ReviewRepository = {
      root,
      label: vscode.workspace.workspaceFolders?.find(folder => folder.uri.fsPath === root)?.name
        ?? path.basename(root),
      kind,
      git,
      diff: new GitDiffProvider(git),
      triage,
      annotations,
    };

    try {
      await prepareWorkspaceStorage(root, storagePath, await legacyStateDirs(root, folders));
      await Promise.all([loadTriage(triage, storagePath), annotations.load()]);
    } catch (err) {
      logger.error(`Failed to load review state for ${root}`, err);
    }

    const save = debounce(() => {
      saveTriage(triage, storagePath).catch(err => {
        logger.error('Failed to save triage state', err);
      });
    }, 300);
    triage.setOnChange(() => {
      save.call();
      this._onDidChangeTriage.fire(repository);
    });
    const watcher = repository.diff.watchChanges(() => this._onDidChangeGitState.fire(repository));

    return {
      repository,
      subscriptions: {
        dispose: () => {
          // Write a pending triage change instead of dropping it.
          save.flush();
          save.dispose();
          watcher.dispose();
        },
      },
    };
  }
}

/**
 * Where earlier versions kept this repository's state: repo-local `.sieve`
 * folders, and storage keyed by a workspace folder below the repository root.
 * Ownership comes from the filesystem, so a nested worktree opened as its own
 * folder never counts as part of the repository around it.
 */
async function legacyStateDirs(root: string, folders: readonly string[]): Promise<string[]> {
  const dirs = [path.join(root, SIEVE_DIR)];
  for (const folder of folders) {
    if (samePath(folder, root)) continue;
    const owner = await findRepositoryRoot(folder);
    if (!owner || !samePath(owner, root)) continue;
    dirs.push(path.join(folder, SIEVE_DIR), workspaceStoragePath(folder));
  }
  return dirs;
}
