import * as fs from 'fs/promises';
import * as path from 'path';
import type { Change, Repository } from '../git';
import { Status } from '../git';
import type { DiffProvider } from './diff.provider';
import type { Disposable } from '../shared/disposable';
import type { ChangedFile, DiffSource, FileDiff, ReviewCheckpoint } from './diff.model';
import { CHECKPOINT_SOURCE_ID } from './diff.model';
import { toFileStatus, toRelativePath } from './git.mapper';
import { parseDiff, buildAddedFileDiff } from './diff.parser';
import { toRefChoices, type RefChoice } from './git-refs';
import { diffSnapshotFile, diffSnapshots, snapshotWorkingTree } from './git-snapshot';
import { logger } from '../shared/logger';

export type ComparisonSeparator = '...' | '..';

interface ComparisonSpec {
  readonly base: string;
  readonly separator: ComparisonSeparator;
  readonly target: string;
}

/** The refs behind the committed section, so pickers can preselect them. */
export interface ComparisonRefs {
  readonly mode: 'branch' | 'custom';
  readonly base: string | undefined;
  readonly target: string | undefined;
  readonly separator: ComparisonSeparator;
}

/** The committed section when there is nothing to compare yet. */
const NO_COMPARISON: DiffSource = {
  id: 'committed',
  label: 'Committed on this branch',
  description: 'No comparison base found',
  baseRef: 'HEAD',
  targetRef: 'HEAD',
};

/**
 * Implements DiffProvider on top of the VS Code built-in git extension.
 *
 * Shows committed branch changes beside staged, unstaged, and untracked work,
 * and, once a review checkpoint is set, what changed since that checkpoint.
 */
export class GitDiffProvider implements DiffProvider {
  private readonly _workingTreeSource: DiffSource = {
    id: 'working-tree',
    label: 'Current changes',
    description: 'HEAD ↔ working tree',
    baseRef: 'HEAD',
    targetRef: undefined,
  };
  private _committedSource = NO_COMPARISON;
  private _customSpec: ComparisonSpec | undefined;
  private _comparisonRefs: ComparisonRefs = {
    mode: 'branch', base: undefined, target: undefined, separator: '...',
  };
  private _checkpoint: ReviewCheckpoint | undefined;
  private _checkpointSource: DiffSource | undefined;
  /** The working tree snapshot from the last refresh, which checkpoint diffs compare to. */
  private _currentTree: string | undefined;

  constructor(private readonly _repo: Repository, private readonly _gitPath = 'git') {}

  async getChangedFiles(): Promise<readonly ChangedFile[]> {
    const committedSource = this._customSpec
      ? await this._resolveCustomSource(this._customSpec)
      : await this._resolveBranchSource();
    this._committedSource = committedSource;

    const committed = committedSource.baseRef === committedSource.targetRef
      ? []
      : await this._repo.diffBetween(committedSource.baseRef, committedSource.targetRef ?? 'HEAD');

    return [
      ...this._mapChanges(committed, committedSource),
      ...this._workingTreeChanges(),
      // Last, so a file in both working-tree sections opens as part of this one.
      ...await this._checkpointChanges(),
    ];
  }

  getSources(): readonly DiffSource[] {
    const sources = [this._committedSource, this._workingTreeSource];
    return this._checkpointSource ? [this._checkpointSource, ...sources] : sources;
  }

  getCheckpoint(): ReviewCheckpoint | undefined {
    return this._checkpoint;
  }

  setCheckpoint(checkpoint: ReviewCheckpoint | undefined): void {
    this._checkpoint = checkpoint;
    if (!checkpoint) this._checkpointSource = undefined;
  }

  /** Snapshots the working tree as it is now and makes it the checkpoint. */
  async createCheckpoint(): Promise<ReviewCheckpoint> {
    const checkpoint = { tree: await this._snapshot(), createdAt: Date.now() };
    this.setCheckpoint(checkpoint);
    return checkpoint;
  }

  private _workingTreeChanges(): readonly ChangedFile[] {
    const { indexChanges, workingTreeChanges, untrackedChanges = [] } = this._repo.state;

    // Merge unstaged first, then let staged overwrite (higher display priority).
    const files = new Map<string, ChangedFile>();

    for (const change of [...workingTreeChanges, ...untrackedChanges]) {
      if (change.status === Status.IGNORED) continue;
      const file = this._mapChange(change, this._workingTreeSource);
      files.set(file.uri, file);
    }

    for (const change of indexChanges) {
      const file = this._mapChange(change, this._workingTreeSource);
      files.set(file.uri, file);
    }

    return [...files.values()];
  }

  async getDiff(file: ChangedFile): Promise<FileDiff> {
    if (file.source?.id === CHECKPOINT_SOURCE_ID) {
      const root = this._repo.rootUri.fsPath;
      const paths = [file.oldPath, file.uri].flatMap(p => p ? [toRelativePath(root, p)] : []);
      const current = this._currentTree ?? await this._snapshot();
      return parseDiff(file, await diffSnapshotFile(this._gitPath, root, file.source.baseRef, current, paths));
    }
    const raw = file.source?.targetRef
      ? await this._repo.diffBetween(file.source.baseRef, file.source.targetRef, file.uri)
      : await this._repo.diffWithHEAD(file.uri);
    if (raw === '' && file.status === 'added') {
      const content = await this.getFileContent(file);
      return buildAddedFileDiff(file, content);
    }
    return parseDiff(file, raw);
  }

  getFileContent(file: ChangedFile): Promise<string> {
    if (file.source?.targetRef) {
      return this._repo.show(file.source.targetRef, file.relativePath);
    }
    return fs.readFile(file.uri, 'utf-8');
  }

  async setComparison(spec: string): Promise<void> {
    const parsed = parseComparison(spec);
    // Resolve once up front so invalid refs are reported to the user immediately.
    await this._resolveComparison(parsed);
    this._customSpec = parsed;
  }

  useBranchComparison(): void {
    this._customSpec = undefined;
  }

  getComparison(): ComparisonRefs {
    return this._comparisonRefs;
  }

  /** Branches, remote branches, and tags, most recently committed first. */
  async listRefs(): Promise<RefChoice[]> {
    const refs = await this._repo.getRefs({ sort: 'committerdate' });
    return toRefChoices(refs, this._repo.state.HEAD);
  }

  /** Files whose content differs from the checkpoint, whether or not they were committed since. */
  private async _checkpointChanges(): Promise<readonly ChangedFile[]> {
    const checkpoint = this._checkpoint;
    if (!checkpoint) return [];

    const time = new Date(checkpoint.createdAt).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const source: DiffSource = {
      id: CHECKPOINT_SOURCE_ID,
      label: 'Since last review',
      description: `Checkpoint ${time} ↔ working tree`,
      baseRef: checkpoint.tree,
      targetRef: undefined,
    };
    this._checkpointSource = source;

    try {
      const root = this._repo.rootUri.fsPath;
      this._currentTree = await this._snapshot();
      const changes = await diffSnapshots(this._gitPath, root, checkpoint.tree, this._currentTree);
      return changes.map(change => ({
        uri: path.join(root, change.path),
        relativePath: change.path,
        status: change.status,
        oldPath: change.oldPath === undefined ? undefined : path.join(root, change.oldPath),
        source,
      }));
    } catch (err) {
      logger.error('Failed to compare with the review checkpoint', err);
      this._checkpointSource = { ...source, description: 'Checkpoint unavailable — set a new one' };
      return [];
    }
  }

  private _snapshot(): Promise<string> {
    return snapshotWorkingTree(this._gitPath, this._repo.rootUri.fsPath);
  }

  private _mapChanges(changes: readonly Change[], source: DiffSource): ChangedFile[] {
    return changes
      .filter(change => change.status !== Status.IGNORED)
      .map(change => this._mapChange(change, source));
  }

  private _mapChange(change: Change, source: DiffSource): ChangedFile {
    const fsPath = change.uri.fsPath;
    const oldPath = change.status === Status.INDEX_RENAMED || change.status === Status.INTENT_TO_RENAME
      ? change.originalUri.fsPath
      : undefined;
    return {
      uri: fsPath,
      relativePath: toRelativePath(this._repo.rootUri.fsPath, fsPath),
      status: toFileStatus(change.status),
      oldPath: oldPath === fsPath ? undefined : oldPath,
      source,
    };
  }

  /** Re-resolves custom refs on every refresh so branch names follow new commits. */
  private async _resolveCustomSource(spec: ComparisonSpec): Promise<DiffSource> {
    this._comparisonRefs = { mode: 'custom', ...spec };
    try {
      return await this._resolveComparison(spec);
    } catch {
      const range = `${spec.base}${spec.separator}${spec.target}`;
      return {
        id: `compare:${range}`,
        label: 'Compared changes',
        description: `Cannot resolve ${range}`,
        baseRef: 'HEAD',
        targetRef: 'HEAD',
      };
    }
  }

  private async _resolveComparison({ base, separator, target }: ComparisonSpec): Promise<DiffSource> {
    const [baseCommit, targetCommit] = await Promise.all([
      this._repo.getCommit(base),
      this._repo.getCommit(target),
    ]);
    const baseRef = separator === '...'
      ? await this._repo.getMergeBase(baseCommit.hash, targetCommit.hash)
      : baseCommit.hash;
    if (!baseRef) throw new Error(`No merge base between ${base} and ${target}`);

    return {
      id: `compare:${base}${separator}${target}`,
      label: 'Compared changes',
      description: `${base}${separator}${target}`,
      baseRef,
      // Keep the ref name, as branch mode keeps 'HEAD': open diff documents and their
      // annotations stay attached while the target branch gains commits.
      targetRef: target,
    };
  }

  private async _resolveBranchSource(): Promise<DiffSource> {
    const branch = this._repo.state.HEAD?.name;
    this._comparisonRefs = { mode: 'branch', base: undefined, target: branch, separator: '...' };
    if (!branch) return NO_COMPARISON;

    const base = await this._findBaseBranch(branch);
    this._comparisonRefs = { ...this._comparisonRefs, base };
    if (!base) {
      return {
        ...NO_COMPARISON,
        id: `branch:${branch}`,
        description: `Choose a base for ${branch}`,
      };
    }

    const mergeBase = await this._repo.getMergeBase(base, 'HEAD');
    if (!mergeBase) {
      return {
        ...NO_COMPARISON,
        id: `branch:${base}...${branch}`,
        description: `No merge base: ${base}...${branch}`,
      };
    }

    return {
      id: `branch:${base}...${branch}`,
      label: 'Committed on this branch',
      description: `${base}...${branch}`,
      baseRef: mergeBase,
      targetRef: 'HEAD',
    };
  }

  private async _findBaseBranch(branch: string): Promise<string | undefined> {
    const configured = await this._repo.getBranchBase(branch).catch(() => undefined);
    if (configured?.name && !sameBranch(configured.name, branch)) return configured.name;

    const [local, remote] = await Promise.all([
      this._repo.getBranches({ remote: false }),
      this._repo.getBranches({ remote: true }),
    ]);
    const names = new Set([...local, ...remote].flatMap(ref => ref.name ? [ref.name] : []));
    const remoteName = this._repo.state.HEAD?.upstream?.remote
      ?? this._repo.state.remotes[0]?.name
      ?? 'origin';
    return [
      `${remoteName}/HEAD`, `${remoteName}/main`, `${remoteName}/master`,
      'main', 'master',
    ].find(name => names.has(name) && !sameBranch(name, branch));
  }

  watchChanges(callback: () => void): Disposable {
    return this._repo.state.onDidChange(callback);
  }
}

function parseComparison(spec: string): ComparisonSpec {
  const match = /^(.+?)(\.\.\.?)(.+)$/.exec(spec.trim());
  if (!match) throw new Error('Use base...target or base..target');

  const base = match[1]!.trim();
  const separator = match[2] as ComparisonSeparator;
  const target = match[3]!.trim();
  if (!base || !target) throw new Error('Both refs are required');
  return { base, separator, target };
}

function sameBranch(left: string, right: string): boolean {
  return path.basename(left) === path.basename(right);
}
