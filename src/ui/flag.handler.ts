import * as vscode from 'vscode';
import type { SieveSession } from '../shared/sieve.session';
import type { AnnotationCategory } from '../review/annotation';
import { FileItem } from './file.item';
import { logger } from '../shared/logger';

interface CategoryOption {
  readonly label: string;
  readonly description: string;
  readonly value: AnnotationCategory | undefined;
}

const CATEGORY_PICKS: readonly CategoryOption[] = [
  { label: '$(close) None',             description: 'No category',                                value: undefined },
  { label: '$(bug) Bug',                description: 'Potential defect or incorrect behaviour',     value: 'bug' },
  { label: '$(shield) Security',        description: 'Security concern or vulnerability',           value: 'security' },
  { label: '$(dashboard) Performance',  description: 'Performance issue or optimisation',           value: 'performance' },
  { label: '$(symbol-structure) Architecture', description: 'Design or structural concern',         value: 'architecture' },
  { label: '$(question) Explain',       description: 'Request for clarification',                   value: 'explain' },
  { label: '$(wrench) Refactor',        description: 'Readability or code quality improvement',     value: 'refactor' },
  { label: '$(beaker) Test',            description: 'Missing or insufficient test coverage',       value: 'test' },
];

/**
 * Toggles flag state on a file.
 * When flagging (not unflagging), prompts for an annotation if none exists.
 *
 * @param item - The tree item passed by the context menu (right-click).
 *               Falls back to `treeView.selection[0]` for keyboard shortcuts.
 */
export async function flagWithAnnotation(session: SieveSession, item?: unknown): Promise<void> {
  const target = item instanceof FileItem ? item : session.treeView.selection[0];
  if (!(target instanceof FileItem)) return;

  const fileUri = target.file.uri;
  const current = session.triage.getState(fileUri);

  // Unflagging — just revert to unreviewed
  if (current === 'flagged') {
    session.triage.setState(fileUri, 'unreviewed');
    return;
  }

  // Flagging — set state first
  session.triage.setState(fileUri, 'flagged');

  // If file already has annotations, no need to prompt
  const existing = session.annotations.getByFileUri(fileUri);
  if (existing.length > 0) return;

  // Prompt for a reason
  const body = await vscode.window.showInputBox({
    prompt: 'Why are you flagging this file?',
    placeHolder: 'Describe the issue…',
  });
  if (!body) return; // user cancelled — flag stays, no annotation

  const picked = await vscode.window.showQuickPick(CATEGORY_PICKS, {
    placeHolder: 'Select annotation category (optional)',
  });
  // Cancel or "None" both result in no category — annotation is still created
  const category = picked?.value;

  await session.annotationController.addFileAnnotation(fileUri, body, category).catch(err => {
    logger.error('Failed to create flag annotation', err);
  });
}
