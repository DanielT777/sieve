import * as vscode from 'vscode';
import type { ChangedFile } from '../diff/diff.model';
import type { ReviewState } from '../review/triage.enum';
import { TRIAGE_ICON, STATUS_BADGE } from './triage.icons';

/** A file node in the Review Desk tree. Shows triage state, git status badge, and opens diff on click. */
export class FileItem extends vscode.TreeItem {
  constructor(readonly file: ChangedFile, state: ReviewState) {
    super(
      file.relativePath.split('/').pop() ?? file.relativePath,
      vscode.TreeItemCollapsibleState.None,
    );
    this.description = STATUS_BADGE[file.status];
    this.iconPath = TRIAGE_ICON[state];
    this.resourceUri = vscode.Uri.file(file.uri); // enables native git decorations
    this.contextValue = 'file';
    this.command = { command: 'sieve.openDiff', title: 'Open Diff', arguments: [file] };
  }
}
