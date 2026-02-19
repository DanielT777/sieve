import * as vscode from 'vscode';

let _channel: vscode.OutputChannel | undefined;

function channel(): vscode.OutputChannel {
  if (!_channel) _channel = vscode.window.createOutputChannel('Sieve');
  return _channel;
}

export const logger = {
  info(msg: string): void {
    channel().appendLine(`[INFO]  ${msg}`);
  },
  warn(msg: string): void {
    channel().appendLine(`[WARN]  ${msg}`);
  },
  error(msg: string, err?: unknown): void {
    const detail = err instanceof Error ? `: ${err.message}` : '';
    channel().appendLine(`[ERROR] ${msg}${detail}`);
  },
  dispose(): void {
    _channel?.dispose();
    _channel = undefined;
  },
};
