import * as vscode from 'vscode';
import * as path from 'path';
import type { ChangedFile } from './diff.model';

/** Opens a VS Code diff view: HEAD (left) vs working tree (right). */
export async function openFileDiff(file: ChangedFile): Promise<void> {
  const workingTreeUri = vscode.Uri.file(file.uri);
  const filename = path.basename(file.uri);

  if (file.status === 'added') {
    // New file — open directly; no HEAD version to diff against.
    await vscode.window.showTextDocument(workingTreeUri);
    return;
  }

  if (file.status === 'deleted') {
    // Diff old file (left) vs empty (right) — all lines appear as deletions.
    await vscode.commands.executeCommand(
      'vscode.diff',
      toGitUri(file.uri, 'HEAD'),
      emptyFileUri(file.uri),
      `${filename} (Deleted)`,
    );
    return;
  }

  // modified / renamed: real diff view
  await vscode.commands.executeCommand(
    'vscode.diff',
    toGitUri(file.uri, 'HEAD'),
    workingTreeUri,
    `${filename} (HEAD ↔ Working Tree)`,
  );
}

function toGitUri(fsPath: string, ref: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: 'git',
    path: fsPath,
    query: JSON.stringify({ path: fsPath, ref }),
  });
}

/** Returns a git URI that resolves to an empty document (the empty tree SHA). */
function emptyFileUri(fsPath: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: 'git',
    path: fsPath,
    query: JSON.stringify({ path: fsPath, ref: '~' }),
  });
}
