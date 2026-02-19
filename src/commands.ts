import * as vscode from 'vscode';
import type { SieveSession } from './shared/sieve.session';
import type { ChangedFile } from './diff/diff.model';
import { Commands } from './shared/config';
import { showFilterQuickPick } from './ui/filter.quickpick';
import { toggleTriageSelected } from './ui/triage.selection';
import { openFileDiff } from './diff/diff.opener';
import { flagWithAnnotation } from './ui/flag.handler';
import { clearReview } from './ui/clear.handler';

export function registerCommands(
  getSession: () => SieveSession | undefined,
): vscode.Disposable[] {
  const withSession = (fn: (s: SieveSession) => void | Promise<void>) => () => {
    const s = getSession();
    if (s) void fn(s);
  };

  return [
    vscode.commands.registerCommand(Commands.refresh, withSession(s => s.treeProvider.refresh())),
    vscode.commands.registerCommand(Commands.markReviewed, (item?: unknown) => {
      const s = getSession();
      if (s) toggleTriageSelected(s.treeView, s.triage, 'reviewed', item);
    }),
    vscode.commands.registerCommand(Commands.flag, (item?: unknown) => {
      const s = getSession();
      if (s) void flagWithAnnotation(s, item);
    }),
    vscode.commands.registerCommand(Commands.filterByStatus, withSession(s => showFilterQuickPick(s.treeProvider))),
    vscode.commands.registerCommand(Commands.export, withSession(s => s.exportService.run())),
    vscode.commands.registerCommand(Commands.openDiff, (file: unknown) => {
      if (isChangedFile(file)) void openFileDiff(file);
    }),
    vscode.commands.registerCommand(Commands.submitAnnotation, (reply: vscode.CommentReply) => {
      const s = getSession();
      if (s) s.annotationController.submit(reply);
    }),
    vscode.commands.registerCommand(Commands.cycleCategory, (thread: vscode.CommentThread) => {
      const s = getSession();
      if (s) return s.annotationController.cycleCategory(thread);
    }),
    vscode.commands.registerCommand(Commands.deleteAnnotation, (thread: vscode.CommentThread) => {
      const s = getSession();
      if (s) void s.annotationController.deleteAnnotation(thread);
    }),
    vscode.commands.registerCommand(Commands.clearReview, withSession(s => clearReview(s))),
  ];
}

function isChangedFile(value: unknown): value is ChangedFile {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.uri === 'string' &&
    typeof v.relativePath === 'string' &&
    typeof v.status === 'string'
  );
}
