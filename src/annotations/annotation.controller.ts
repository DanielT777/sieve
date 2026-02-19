import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import type { Annotation, AnnotationCategory } from '../review/annotation';
import type { AnnotationStore } from './annotation.store';
import { parseAnnotationBody } from './annotation.parser';
import { logger } from '../shared/logger';

interface CategoryOption {
  readonly label: string;
  readonly description: string;
  readonly value: AnnotationCategory | undefined;
}

const CATEGORY_PICKS: readonly CategoryOption[] = [
  { label: '$(close) None',                     description: 'No category',                              value: undefined },
  { label: '$(bug) Bug',                        description: 'Potential defect or incorrect behaviour',  value: 'bug' },
  { label: '$(shield) Security',                description: 'Security concern or vulnerability',        value: 'security' },
  { label: '$(dashboard) Performance',          description: 'Performance issue or optimisation',        value: 'performance' },
  { label: '$(symbol-structure) Architecture',  description: 'Design or structural concern',             value: 'architecture' },
  { label: '$(question) Explain',               description: 'Request for clarification',                value: 'explain' },
  { label: '$(wrench) Refactor',                description: 'Readability or code quality improvement',  value: 'refactor' },
  { label: '$(beaker) Test',                    description: 'Missing or insufficient test coverage',    value: 'test' },
];

/**
 * Manages the VS Code CommentController for Sieve annotations.
 *
 * Category is selected via a dropdown (QuickPick) triggered by
 * the tag button in the thread header. Power users can still
 * inline a `[tag]` prefix to skip the picker.
 */
export class AnnotationController implements vscode.Disposable {
  private readonly _controller: vscode.CommentController;
  private readonly _pendingCategories = new Map<vscode.CommentThread, AnnotationCategory | undefined>();
  private readonly _threadAnnotationIds = new Map<vscode.CommentThread, string>();

  private _onAnnotate: (fileUri: string) => void = () => {};

  constructor(
    private readonly _store: AnnotationStore,
    private readonly _changedFileUris: () => ReadonlySet<string>,
  ) {
    this._controller = vscode.comments.createCommentController('sieve', 'Sieve Annotations');
    this._controller.options = { placeHolder: 'Describe the issue… Use the tag icon (top-right) to set category' };
    this._controller.commentingRangeProvider = {
      provideCommentingRanges: (document: vscode.TextDocument): vscode.Range[] => {
        if (document.uri.scheme !== 'file') return [];
        if (!this._changedFileUris().has(document.uri.fsPath)) return [];
        return [new vscode.Range(0, 0, Math.max(0, document.lineCount - 1), 0)];
      },
    };
  }

  /** Registers a callback fired whenever an annotation is added to a file. */
  setOnAnnotate(fn: (fileUri: string) => void): void {
    this._onAnnotate = fn;
  }

  /** Opens a dropdown to select the category (tag button in header). */
  async cycleCategory(thread: vscode.CommentThread): Promise<void> {
    const picked = await vscode.window.showQuickPick(CATEGORY_PICKS, {
      placeHolder: 'Select annotation category',
    });
    if (!picked) return;

    this._pendingCategories.set(thread, picked.value);
    thread.label = picked.value ?? '';

    // If the thread already has a persisted annotation, update its category in the store.
    const id = this._threadAnnotationIds.get(thread);
    if (id) {
      this._store.updateCategory(id, picked.value).catch(err => {
        logger.error('Failed to update annotation category', err);
      });
      const annotation = this._store.getById(id);
      if (annotation) {
        thread.comments = [this._makeComment({ ...annotation, category: picked.value })];
      }
    }
  }

  /** Called by `sieve.submitAnnotation` command when user submits a comment. */
  submit(reply: vscode.CommentReply): void {
    const { thread, text } = reply;
    if (!thread.range) return;

    const parsed = parseAnnotationBody(text);
    const category = parsed.hasExplicitCategory
      ? parsed.category
      : this._pendingCategories.get(thread);

    const annotation: Annotation = {
      id: this._generateId(),
      fileUri: thread.uri.fsPath,
      startLine: thread.range.start.line,
      endLine: thread.range.end.line,
      category,
      body: parsed.body,
      createdAt: Date.now(),
      resolved: false,
    };

    thread.comments = [this._makeComment(annotation)];
    thread.label = annotation.category ?? '';
    thread.canReply = false;

    this._pendingCategories.delete(thread);
    this._threadAnnotationIds.set(thread, annotation.id);

    this._store.add(annotation).catch(err => {
      logger.error('Failed to save annotation', err);
    });

    this._onAnnotate(annotation.fileUri);
  }

  /** Deletes an annotation and disposes its thread. */
  async deleteAnnotation(thread: vscode.CommentThread): Promise<void> {
    const id = this._threadAnnotationIds.get(thread);
    if (id) {
      await this._store.remove(id);
      this._threadAnnotationIds.delete(thread);
    }
    this._pendingCategories.delete(thread);
    thread.dispose();
  }

  /** Creates a file-level annotation (line 0) programmatically — used by flag command. */
  async addFileAnnotation(fileUri: string, body: string, category?: AnnotationCategory): Promise<void> {
    const annotation: Annotation = {
      id: this._generateId(),
      fileUri,
      startLine: 0,
      endLine: 0,
      category,
      body,
      createdAt: Date.now(),
      resolved: false,
    };

    const uri = vscode.Uri.file(fileUri);
    const range = new vscode.Range(0, 0, 0, 0);
    const thread = this._controller.createCommentThread(uri, range, [this._makeComment(annotation)]);
    thread.label = annotation.category ?? '';
    thread.canReply = false;
    this._threadAnnotationIds.set(thread, annotation.id);

    await this._store.add(annotation);
    this._onAnnotate(annotation.fileUri);
  }

  /** Restores persisted annotation threads on extension startup. */
  restore(): void {
    for (const annotation of this._store.getAll()) {
      const uri = vscode.Uri.file(annotation.fileUri);
      const range = new vscode.Range(annotation.startLine, 0, annotation.endLine, 0);
      const thread = this._controller.createCommentThread(uri, range, [this._makeComment(annotation)]);
      thread.label = annotation.category ?? '';
      thread.canReply = false;
      this._threadAnnotationIds.set(thread, annotation.id);
    }
  }

  /** Disposes all threads tracked by this controller. */
  disposeAllThreads(): void {
    for (const thread of this._threadAnnotationIds.keys()) {
      thread.dispose();
    }
    this._threadAnnotationIds.clear();
    this._pendingCategories.clear();
  }

  dispose(): void {
    this.disposeAllThreads();
    this._controller.dispose();
  }

  private _generateId(): string {
    return randomUUID();
  }

  private _makeComment(annotation: Annotation): vscode.Comment {
    const prefix = annotation.category ? `**[${annotation.category}]** ` : '';
    return {
      body: new vscode.MarkdownString(`${prefix}${annotation.body}`),
      mode: vscode.CommentMode.Preview,
      author: { name: 'You' },
    };
  }
}
