import * as vscode from 'vscode';
import * as path from 'path';
import type { ChangedFile } from './diff.model';

/** Opens the exact comparison represented by a Review Desk file. */
export async function openFileDiff(file: ChangedFile): Promise<void> {
  const baseRef = file.source?.baseRef ?? 'HEAD';
  const targetUri = targetDocumentUri(file);
  const filename = path.basename(file.uri);

  if (file.status === 'added') {
    await vscode.window.showTextDocument(targetUri);
    return;
  }

  if (file.status === 'deleted') {
    // Diff old file (left) vs empty (right) — all lines appear as deletions.
    await vscode.commands.executeCommand(
      'vscode.diff',
      toGitUri(file.oldPath ?? file.uri, baseRef),
      emptyFileUri(file.uri),
      `${filename} (Deleted)`,
    );
    return;
  }

  await vscode.commands.executeCommand(
    'vscode.diff',
    toGitUri(file.oldPath ?? file.uri, baseRef),
    targetUri,
    `${filename} (${file.source?.description ?? 'HEAD ↔ working tree'})`,
  );
}

export function targetDocumentUri(file: ChangedFile): vscode.Uri {
  return file.source?.targetRef
    ? toGitUri(file.uri, file.source.targetRef)
    : vscode.Uri.file(file.uri);
}

export function toGitUri(fsPath: string, ref: string): vscode.Uri {
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
