import * as path from 'path';
import { Status } from '../git';
import type { ChangedFile } from './diff.model';

/** Maps a git Status value to our domain FileStatus. Unlisted statuses → 'modified'. */
const GIT_STATUS_MAP: Partial<Record<Status, ChangedFile['status']>> = {
  [Status.INDEX_ADDED]: 'added',
  [Status.UNTRACKED]: 'added',
  [Status.INTENT_TO_ADD]: 'added',
  [Status.INDEX_DELETED]: 'deleted',
  [Status.DELETED]: 'deleted',
  [Status.DELETED_BY_US]: 'deleted',
  [Status.DELETED_BY_THEM]: 'deleted',
  [Status.INDEX_RENAMED]: 'renamed',
  [Status.INTENT_TO_RENAME]: 'renamed',
};

export function toFileStatus(status: Status): ChangedFile['status'] {
  return GIT_STATUS_MAP[status] ?? 'modified';
}

export function toRelativePath(rootPath: string, absolutePath: string): string {
  return path.relative(rootPath, absolutePath).replace(/\\/g, '/');
}
