import * as vscode from 'vscode';
import type { ReviewStats } from '../review/review.session';

/** Status bar item showing live review progress ("X/Y reviewed"). */
export class SieveStatusBar implements vscode.Disposable {
  private readonly _item: vscode.StatusBarItem;

  constructor() {
    this._item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this._item.command = 'sieve.filterByStatus';
    this._item.name = 'Sieve Review Progress';
  }

  update(stats: ReviewStats): void {
    if (stats.total === 0) {
      this._item.hide();
      return;
    }

    this._item.text = `$(filter) ${stats.reviewed}/${stats.total} reviewed`;
    this._item.tooltip = new vscode.MarkdownString(
      `**Sieve Review Progress**\n\n` +
      `✅ ${stats.reviewed} reviewed\n\n` +
      `🚩 ${stats.flagged} flagged\n\n` +
      `⬜ ${stats.unreviewed} unreviewed`,
    );
    this._item.show();
  }

  dispose(): void {
    this._item.dispose();
  }
}
