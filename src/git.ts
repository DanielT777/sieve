/**
 * Minimal subset of the VS Code built-in git extension API.
 *
 * Vendored here so we can use a regular `enum` (not `const enum`) —
 * esbuild cannot inline `const enum` values from external declaration files.
 *
 * Based on: https://github.com/microsoft/vscode/blob/main/extensions/git/src/api/git.d.ts
 */
import type { Uri, Event } from 'vscode';

export enum Status {
  INDEX_MODIFIED = 0,
  INDEX_ADDED = 1,
  INDEX_DELETED = 2,
  INDEX_RENAMED = 3,
  INDEX_COPIED = 4,
  MODIFIED = 5,
  DELETED = 6,
  UNTRACKED = 7,
  IGNORED = 8,
  INTENT_TO_ADD = 9,
  INTENT_TO_RENAME = 10,
  TYPE_CHANGED = 11,
  ADDED_BY_US = 12,
  ADDED_BY_THEM = 13,
  DELETED_BY_US = 14,
  DELETED_BY_THEM = 15,
  BOTH_ADDED = 16,
  BOTH_DELETED = 17,
  BOTH_MODIFIED = 18,
}

export interface Change {
  readonly uri: Uri;
  readonly originalUri: Uri;
  readonly renameUri: Uri | undefined;
  readonly status: Status;
}

export enum RefType {
  Head = 0,
  RemoteHead = 1,
  Tag = 2,
}

export interface Ref {
  readonly type?: RefType;
  readonly name?: string;
  readonly commit?: string;
  readonly remote?: string;
}

export interface RefQuery {
  readonly count?: number;
  readonly pattern?: string;
  readonly sort?: 'alphabetically' | 'committerdate';
}

export interface UpstreamRef {
  readonly remote: string;
  readonly name: string;
}

export interface Branch extends Ref {
  readonly upstream?: UpstreamRef;
}

export interface Remote {
  readonly name: string;
}

export interface RepositoryState {
  readonly HEAD: Branch | undefined;
  readonly remotes: Remote[];
  readonly indexChanges: Change[];
  readonly workingTreeChanges: Change[];
  /** Separate in recent VS Code versions; older versions include these in workingTreeChanges. */
  readonly untrackedChanges?: Change[];
  readonly mergeChanges: Change[];
  readonly onDidChange: Event<void>;
}

export interface Repository {
  readonly rootUri: Uri;
  readonly state: RepositoryState;
  show(ref: string, filePath: string): Promise<string>;
  diffWithHEAD(path?: string): Promise<string>;
  diffBetween(ref1: string, ref2: string): Promise<Change[]>;
  diffBetween(ref1: string, ref2: string, path: string): Promise<string>;
  getBranchBase(name: string): Promise<Branch | undefined>;
  getBranches(query: { readonly remote?: boolean }): Promise<Ref[]>;
  getRefs(query: RefQuery): Promise<Ref[]>;
  getCommit(ref: string): Promise<{ readonly hash: string }>;
  getMergeBase(ref1: string, ref2: string): Promise<string | undefined>;
}

export interface API {
  readonly repositories: Repository[];
  readonly onDidOpenRepository: Event<Repository>;
  readonly onDidCloseRepository: Event<Repository>;
  getRepository(uri: Uri): Repository | null;
}

export interface GitExtension {
  readonly enabled: boolean;
  readonly onDidChangeEnablement: Event<boolean>;
  getAPI(version: 1): API;
}
