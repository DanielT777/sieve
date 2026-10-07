import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import type { Annotation, AnnotationCategory } from '../review/annotation';
import type { AnnotationStore } from './annotation.store';
import { parseAnnotationBody } from './annotation.parser';
import { logger } from '../shared/logger';
import type { ChangedFile } from '../diff/diff.model';
import type { ReviewFile } from '../review/review.repository';
import type { ReviewDeskProvider } from '../ui/review-desk.provider';
import { targetDocumentUri } from '../diff/diff.opener';

interface CategoryOption {
  readonly label: string;
  readonly description: string;
  readonly value: AnnotationCategory | undefined;
}

/** A persisted annotation shown in a thread, and the store that owns it. */
interface ThreadAnnotation {
  readonly id: string;
  readonly store: AnnotationStore;
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
  private readonly _threadAnnotations = new Map<vscode.CommentThread, ThreadAnnotation>();

  private _onAnnotate: (entry: ReviewFile) => void = () => {};

  constructor(private readonly _files: ReviewDeskProvider) {
    this._controller = vscode.comments.createCommentController('sieve', 'Sieve Annotations');
    this._controller.options = { placeHolder: 'Describe the issue… Use the tag icon (top-right) to set category' };
    this._controller.commentingRangeProvider = {
      provideCommentingRanges: (document: vscode.TextDocument): vscode.Range[] => {
        if (!this._files.getFileForDocument(document.uri)) return [];
        return [new vscode.Range(0, 0, Math.max(0, document.lineCount - 1), 0)];
      },
    };
  }

  /** Registers a callback fired whenever an annotation is added to a file. */
  setOnAnnotate(fn: (entry: ReviewFile) => void): void {
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
    const tracked = this._threadAnnotations.get(thread);
    if (tracked) {
      tracked.store.updateCategory(tracked.id, picked.value).catch(err => {
        logger.error('Failed to update annotation category', err);
      });
      const annotation = tracked.store.getById(tracked.id);
      if (annotation) {
        thread.comments = [this._makeComment({ ...annotation, category: picked.value })];
      }
    }
  }

  /** Called by `sieve.submitAnnotation` command when user submits a comment. */
  submit(reply: vscode.CommentReply): void {
    const { thread, text } = reply;
    if (!thread.range) return;
    const entry = this._files.getFileForDocument(thread.uri);
    if (!entry) return;
    const { file, repository } = entry;

    const parsed = parseAnnotationBody(text);
    const category = parsed.hasExplicitCategory
      ? parsed.category
      : this._pendingCategories.get(thread);

    const annotation: Annotation = {
      id: this._generateId(),
      fileUri: file.uri,
      sourceId: persistedSourceId(file),
      startLine: thread.range.start.line,
      endLine: thread.range.end.line,
      category,
      body: parsed.body,
      createdAt: Date.now(),
      resolved: false,
      fileLevel: false,
    };

    thread.comments = [this._makeComment(annotation)];
    thread.label = annotation.category ?? '';
    thread.canReply = false;

    this._pendingCategories.delete(thread);
    this._threadAnnotations.set(thread, { id: annotation.id, store: repository.annotations });

    repository.annotations.add(annotation).catch(err => {
      logger.error('Failed to save annotation', err);
    });

    this._onAnnotate(entry);
  }

  /** Deletes an annotation and disposes its thread. */
  async deleteAnnotation(thread: vscode.CommentThread): Promise<void> {
    const tracked = this._threadAnnotations.get(thread);
    if (tracked) {
      await tracked.store.remove(tracked.id);
      this._threadAnnotations.delete(thread);
    }
    this._pendingCategories.delete(thread);
    thread.dispose();
  }

  /** Creates a file-level annotation (line 0) programmatically — used by flag command. */
  async addFileAnnotation(entry: ReviewFile, body: string, category?: AnnotationCategory): Promise<void> {
    const { file, repository } = entry;
    const annotation: Annotation = {
      id: this._generateId(),
      fileUri: file.uri,
      sourceId: persistedSourceId(file),
      startLine: 0,
      endLine: 0,
      category,
      body,
      createdAt: Date.now(),
      resolved: false,
      fileLevel: true,
    };

    const uri = targetDocumentUri(file);
    const range = new vscode.Range(0, 0, 0, 0);
    const thread = this._controller.createCommentThread(uri, range, [this._makeComment(annotation)]);
    thread.label = annotation.category ?? '';
    thread.canReply = false;
    this._threadAnnotations.set(thread, { id: annotation.id, store: repository.annotations });

    await repository.annotations.add(annotation);
    this._onAnnotate(entry);
  }

  /** Restores threads that belong to files in the currently displayed comparisons. */
  restore(): void {
    this.disposeAllThreads();
    for (const repository of this._files.repositories) {
      for (const annotation of repository.annotations.getAll()) {
        const entry = this._files.getFile(annotation.sourceId, annotation.fileUri);
        if (entry?.repository !== repository) continue;
        const uri = targetDocumentUri(entry.file);
        const range = new vscode.Range(annotation.startLine, 0, annotation.endLine, 0);
        const thread = this._controller.createCommentThread(uri, range, [this._makeComment(annotation)]);
        thread.label = annotation.category ?? '';
        thread.canReply = false;
        this._threadAnnotations.set(thread, { id: annotation.id, store: repository.annotations });
      }
    }
  }

  /** Disposes all threads tracked by this controller. */
  disposeAllThreads(): void {
    for (const thread of this._threadAnnotations.keys()) {
      thread.dispose();
    }
    this._threadAnnotations.clear();
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

function persistedSourceId(file: ChangedFile): string | undefined {
  return file.source?.id === 'working-tree' ? undefined : file.source?.id;
}
