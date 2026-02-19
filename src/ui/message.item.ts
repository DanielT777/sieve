import * as vscode from 'vscode';

/** A non-interactive message node shown in the Review Desk tree (e.g. empty filter result). */
export class MessageItem extends vscode.TreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'message';
  }
}
