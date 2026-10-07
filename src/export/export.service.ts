import * as vscode from 'vscode';
import type { ReviewRepository } from '../review/review.repository';
import { uniqueRepositoryNames } from '../review/repository.names';
import type { ReviewExporter, ExportFileData } from './review.exporter';
import type { Annotation } from '../review/annotation';
import { ClaudeExporter } from './claude.exporter';
import { GenericLlmExporter } from './generic-llm.exporter';
import { MarkdownExporter } from './markdown.exporter';
import { annotationsForHunk, orphanAnnotations, buildContextHunks, trimHunkAroundAnnotations } from './export.utils';
import { logger } from '../shared/logger';
import { annotationSourceId } from '../review/annotation';

const EXPORTERS: ReviewExporter[] = [
  new GenericLlmExporter(),
  new ClaudeExporter(),
  new MarkdownExporter(),
];

/** Orchestrates the export flow: format selection → build payload → clipboard. */
export class ExportService {
  constructor(private readonly _repositories: () => readonly ReviewRepository[]) {}

  async run(): Promise<void> {
    const picked = await vscode.window.showQuickPick(
      EXPORTERS.map(e => ({ label: e.label, exporter: e })),
      { placeHolder: 'Choose a format to copy for your LLM' },
    );
    if (!picked) return;

    const repositories = await this._pickRepositories();
    if (!repositories) return;

    try {
      const prefixes = repositories.length > 1 ? uniqueRepositoryNames(repositories) : [];
      const payload = (await Promise.all(
        repositories.map((repository, index) => this._buildPayload(repository, prefixes[index])),
      )).flat();

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

  /** Asks which repository to copy when more than one has annotations. */
  private async _pickRepositories(): Promise<readonly ReviewRepository[] | undefined> {
    const annotated = this._repositories().filter(repository => repository.annotations.getAll().length > 0);
    if (annotated.length <= 1) return annotated;

    const picked = await vscode.window.showQuickPick([
      ...annotated.map(repository => ({
        label: repository.label,
        description: `${repository.annotations.getAll().length} annotation(s)`,
        detail: repository.root,
        repositories: [repository],
      })),
      {
        label: 'All repositories',
        description: 'Paths are prefixed with the repository name',
        repositories: annotated,
      },
    ], { placeHolder: 'Copy the review of which repository?' });
    return picked?.repositories;
  }

  /**
   * Builds one repository's payload: only files that have annotations, with
   * hunks only (no full file). When several repositories are copied together,
   * paths get a prefix naming the repository.
   */
  private async _buildPayload(
    repository: ReviewRepository,
    pathPrefix: string | undefined,
  ): Promise<readonly ExportFileData[]> {
    const allAnnotations = repository.annotations.getAll();
    if (allAnnotations.length === 0) return [];

    const annotationsByUri = this._indexByUri(allAnnotations);
    const allFiles = await repository.diff.getChangedFiles();
    const annotatedFiles = allFiles.filter(f => annotationsByUri.has(sourcePathKey(f.source?.id, f.uri)));

    const payload = await Promise.all(
      annotatedFiles.map(async file => {
        const fileAnnotations = annotationsByUri.get(sourcePathKey(file.source?.id, file.uri)) ?? [];
        const hasLineAnnotations = fileAnnotations.some(a => !a.fileLevel);

        // File-level only (e.g. flagged file) → no diff needed, just path + annotations.
        if (!hasLineAnnotations) {
          const emptyDiff = { file, hunks: [], additions: 0, deletions: 0 };
          return { file, fileDiff: emptyDiff, annotations: fileAnnotations };
        }

        let fileDiff = await repository.diff.getDiff(file);

        // Generate context-only hunks for annotations on unchanged lines.
        const orphans = orphanAnnotations(fileDiff.hunks, fileAnnotations);
        const lineOrphans = orphans.filter(a => !a.fileLevel);
        if (lineOrphans.length > 0) {
          const content = await repository.diff.getFileContent(file);
          const contextHunks = buildContextHunks(file.uri, content.split('\n'), lineOrphans);
          const mergedHunks = [...fileDiff.hunks, ...contextHunks].sort((a, b) => a.newStart - b.newStart);
          fileDiff = { ...fileDiff, hunks: mergedHunks };
        }

        // Trim large hunks to only keep lines around annotations + context.
        // Without this, a file-sized hunk (e.g. newly added file) would dump
        // the entire content even if only a few lines are annotated.
        const trimmedHunks = fileDiff.hunks.flatMap(hunk => {
          const hunkAnnotations = annotationsForHunk(hunk, fileAnnotations);
          return trimHunkAroundAnnotations(hunk, hunkAnnotations);
        });
        fileDiff = { ...fileDiff, hunks: trimmedHunks };

        return { file, fileDiff, annotations: fileAnnotations };
      }),
    );
    if (pathPrefix === undefined) return payload;

    return payload.map(data => {
      const file = { ...data.file, relativePath: `${pathPrefix}/${data.file.relativePath}` };
      return { ...data, file, fileDiff: { ...data.fileDiff, file } };
    });
  }

  private _indexByUri(annotations: readonly Annotation[]): Map<string, Annotation[]> {
    const index = new Map<string, Annotation[]>();
    for (const a of annotations) {
      const key = sourcePathKey(annotationSourceId(a), a.fileUri);
      const list = index.get(key) ?? [];
      list.push(a);
      index.set(key, list);
    }
    return index;
  }
}

function sourcePathKey(sourceId: string | undefined, fileUri: string): string {
  return `${sourceId ?? 'working-tree'}\0${fileUri}`;
}
