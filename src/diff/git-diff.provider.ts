import * as fs from 'fs/promises';
import type { Repository } from '../git';
import { Status } from '../git';
import type { DiffProvider } from './diff.provider';
import type { Disposable } from '../shared/disposable';
import type { ChangedFile, FileDiff } from './diff.model';
import { toFileStatus, toRelativePath } from './git.mapper';
import { parseDiff, buildAddedFileDiff } from './diff.parser';

/**
 * Implements DiffProvider on top of the VS Code built-in git extension.
 *
 * Changed files are derived from `repo.state.indexChanges` (staged) and
 * `repo.state.workingTreeChanges` (unstaged). Staged status takes display
 * priority when a file appears in both.
 */
export class GitDiffProvider implements DiffProvider {
  constructor(private readonly _repo: Repository) {}

  getChangedFiles(): Promise<readonly ChangedFile[]> {
    const { indexChanges, workingTreeChanges } = this._repo.state;
    const rootPath = this._repo.rootUri.fsPath;

    // Merge unstaged first, then let staged overwrite (higher display priority).
    const files = new Map<string, ChangedFile>();

    for (const change of workingTreeChanges) {
      if (change.status === Status.IGNORED) continue;
      const fsPath = change.uri.fsPath;
      files.set(fsPath, {
        uri: fsPath,
        relativePath: toRelativePath(rootPath, fsPath),
        status: toFileStatus(change.status),
        oldPath: change.renameUri?.fsPath,
      });
    }

    for (const change of indexChanges) {
      const fsPath = change.uri.fsPath;
      files.set(fsPath, {
        uri: fsPath,
        relativePath: toRelativePath(rootPath, fsPath),
        status: toFileStatus(change.status),
        oldPath: change.renameUri?.fsPath,
      });
    }

    return Promise.resolve([...files.values()]);
  }

  async getDiff(file: ChangedFile): Promise<FileDiff> {
    const raw = await this._repo.diffWithHEAD(file.uri);
    if (raw === '' && file.status === 'added') {
      const content = await fs.readFile(file.uri, 'utf-8');
      return buildAddedFileDiff(file, content);
    }
    return parseDiff(file, raw);
  }

  watchChanges(callback: () => void): Disposable {
    return this._repo.state.onDidChange(callback);
  }
}
