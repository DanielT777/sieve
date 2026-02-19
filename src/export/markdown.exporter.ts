import type { ExportFileData, ExportResult, ReviewExporter } from './review.exporter';
import { collectCategories, buildPromptInstructions } from './prompt.builder';
import { annotationsForHunk, orphanAnnotations, hunkToDiffText } from './export.utils';

function escapePipe(s: string): string {
  return s.replace(/\|/g, '\\|');
}

/** Exports annotated files as a clean Markdown report for docs or sharing. */
export class MarkdownExporter implements ReviewExporter {
  readonly id = 'markdown';
  readonly label = 'Markdown Report';

  export(files: readonly ExportFileData[]): ExportResult {
    const date = new Date().toLocaleDateString();
    const allAnnotations = files.flatMap(f => [...f.annotations]);
    const instructions = buildPromptInstructions(collectCategories(allAnnotations));
    const sections = files.map(d => this._fileSection(d)).join('\n\n');

    const content =
      `# Sieve Review Report\n\n` +
      `**Date:** ${date} · **Files:** ${files.length}\n\n` +
      `## Instructions\n\n${instructions}\n\n---\n\n` +
      sections;

    return { content, mimeType: 'text/markdown', suggestedFilename: 'sieve-report.md' };
  }

  private _fileSection(d: ExportFileData): string {
    const hunks = d.fileDiff.hunks
      .filter(hunk => annotationsForHunk(hunk, d.annotations).length > 0)
      .map(hunk => {
        const diff = hunkToDiffText(hunk);
        const annots = annotationsForHunk(hunk, d.annotations);

        const annotRows =
          `\n\n| Line | Category | Note |\n|------|----------|------|\n` +
          annots.map(a => `| ${a.startLine + 1} | ${a.category ?? '—'} | ${escapePipe(a.body)} |`).join('\n');

        return `\`\`\`diff\n${diff}\n\`\`\`` + annotRows;
      }).join('\n\n');

    const orphans = orphanAnnotations(d.fileDiff.hunks, d.annotations);
    const orphanSection = orphans.length > 0
      ? `\n\n| Category | Note |\n|----------|------|\n` +
        orphans.map(a => `| ${a.category ?? '—'} | ${escapePipe(a.body)} |`).join('\n')
      : '';

    return (
      `### \`${d.file.relativePath}\`\n\n` +
      `**Status:** ${d.file.status}\n\n` +
      hunks +
      orphanSection
    );
  }
}
