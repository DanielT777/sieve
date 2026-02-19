import * as vscode from 'vscode';
import type { ChangedFile } from '../diff/diff.model';
import type { ReviewState } from '../review/triage.enum';

/** Maps a ReviewState to its corresponding ThemeIcon. */
export const TRIAGE_ICON: Record<ReviewState, vscode.ThemeIcon> = {
  reviewed: new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed')),
  flagged: new vscode.ThemeIcon('flag', new vscode.ThemeColor('list.warningForeground')),
  unreviewed: new vscode.ThemeIcon('circle-outline'),
};

/** Maps a FileStatus to its single-letter git badge. */
export const STATUS_BADGE: Record<ChangedFile['status'], string> = {
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  modified: 'M',
};
