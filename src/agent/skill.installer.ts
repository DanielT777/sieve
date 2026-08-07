import * as fs from 'fs/promises';
import { homedir } from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

interface SkillTarget {
  readonly label: string;
  readonly description: string;
  readonly directories: readonly string[];
}

export async function installAgentSkill(context: vscode.ExtensionContext): Promise<void> {
  const home = homedir();
  const claude = path.join(home, '.claude', 'skills', 'address-sieve-review');
  const codex = path.join(home, '.codex', 'skills', 'address-sieve-review');
  const targets: readonly SkillTarget[] = [
    { label: 'Claude Code and Codex', description: 'Install for both agents', directories: [claude, codex] },
    { label: 'Claude Code', description: claude, directories: [claude] },
    { label: 'Codex', description: codex, directories: [codex] },
  ];

  const picked = await vscode.window.showQuickPick(targets, {
    placeHolder: 'Install the Sieve review skill for…',
  });
  if (!picked) return;

  const source = path.join(context.extensionPath, 'skills', 'address-sieve-review');
  try {
    await Promise.all(picked.directories.map(async directory => {
      await fs.mkdir(path.dirname(directory), { recursive: true });
      await fs.cp(source, directory, { recursive: true, force: true });
    }));
    void vscode.window.showInformationMessage(`Sieve: Agent skill installed for ${picked.label}.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Sieve: Could not install agent skill — ${message}`);
  }
}
