import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import type { DiffProvider } from '../diff/diff.provider';
import type { AnnotationStore } from '../annotations/annotation.store';
import type { ReviewExporter, ExportFileData } from './review.exporter';
import type { Annotation } from '../review/annotation';
import { ClaudeExporter } from './claude.exporter';
import { GenericLlmExporter } from './generic-llm.exporter';
import { MarkdownExporter } from './markdown.exporter';
import { orphanAnnotations, buildContextHunks } from './export.utils';
import { logger } from '../shared/logger';

const EXPORTERS: ReviewExporter[] = [
  new GenericLlmExporter(),
  new ClaudeExporter(),
  new MarkdownExporter(),
];

/** Orchestrates the export flow: format selection → build payload → clipboard. */
export class ExportService {
  constructor(
    private readonly _diff: DiffProvider,
    private readonly _annotations: AnnotationStore,
  ) {}

  async run(): Promise<void> {
    const picked = await vscode.window.showQuickPick(
      EXPORTERS.map(e => ({ label: e.label, exporter: e })),
      { placeHolder: 'Select export format' },
    );
    if (!picked) return;

    try {
      const payload = await this._buildPayload();

      if (payload.length === 0) {
        void vscode.window.showInformationMessage(
          'Sieve: No annotations to export. Add annotations to files to include them.',
        );
        return;
      }

      const result = picked.exporter.export(payload);
      await vscode.env.clipboard.writeText(result.content);
      void vscode.window.showInformationMessage(
        `Sieve: ${payload.length} annotated file(s) copied to clipboard (${picked.exporter.label}).`,
      );
    } catch (err) {
      logger.error('Export failed', err);
      void vscode.window.showErrorMessage('Sieve: Export failed — see Output panel for details.');
    }
  }

  /** Builds the payload: only files that have annotations, with hunks only (no full file). */
  private async _buildPayload(): Promise<readonly ExportFileData[]> {
    const allAnnotations = this._annotations.getAll();
    if (allAnnotations.length === 0) return [];

    const annotationsByUri = this._indexByUri(allAnnotations);
    const allFiles = await this._diff.getChangedFiles();
    const annotatedFiles = allFiles.filter(f => annotationsByUri.has(f.uri));

    return Promise.all(
      annotatedFiles.map(async file => {
        const fileAnnotations = annotationsByUri.get(file.uri) ?? [];
        const hasLineAnnotations = fileAnnotations.some(a => a.startLine > 0);

        // File-level only (e.g. flagged file) → no diff needed, just path + annotations.
        if (!hasLineAnnotations) {
          const emptyDiff = { file, hunks: [], additions: 0, deletions: 0 };
          return { file, fileDiff: emptyDiff, annotations: fileAnnotations };
        }

        let fileDiff = await this._diff.getDiff(file);

        // Generate context-only hunks for annotations on unchanged lines.
        const orphans = orphanAnnotations(fileDiff.hunks, fileAnnotations);
        const lineOrphans = orphans.filter(a => a.startLine > 0);
        if (lineOrphans.length > 0) {
          const content = await fs.readFile(file.uri, 'utf-8');
          const contextHunks = buildContextHunks(file.uri, content.split('\n'), lineOrphans);
          const mergedHunks = [...fileDiff.hunks, ...contextHunks].sort((a, b) => a.newStart - b.newStart);
          fileDiff = { ...fileDiff, hunks: mergedHunks };
        }

        return { file, fileDiff, annotations: fileAnnotations };
      }),
    );
  }

  private _indexByUri(annotations: readonly Annotation[]): Map<string, Annotation[]> {
    const index = new Map<string, Annotation[]>();
    for (const a of annotations) {
      const list = index.get(a.fileUri) ?? [];
      list.push(a);
      index.set(a.fileUri, list);
    }
    return index;
  }
}
