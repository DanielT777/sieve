import type { ExportFileData, ExportResult, ReviewExporter } from './review.exporter';
import { collectCategories, buildPromptInstructions } from './prompt.builder';
import { annotationsForHunk, orphanAnnotations, hunkToDiffText } from './export.utils';

/** Exports annotated files as Markdown suitable for any LLM (GPT, Copilot, etc.). */
export class GenericLlmExporter implements ReviewExporter {
  readonly id = 'generic';
  readonly label = 'Generic LLM (Markdown)';

  export(files: readonly ExportFileData[]): ExportResult {
    const allAnnotations = files.flatMap(f => [...f.annotations]);
    const instructions = buildPromptInstructions(collectCategories(allAnnotations));
    const sections = files.map(d => this._fileToMarkdown(d)).join('\n\n---\n\n');
    const content =
      `# Code Review\n\n` +
      `## Instructions\n${instructions}\n\n` +
      sections;

    return { content, mimeType: 'text/markdown', suggestedFilename: 'sieve-review.md' };
  }

  private _fileToMarkdown(d: ExportFileData): string {
    const hunks = d.fileDiff.hunks
      .filter(hunk => annotationsForHunk(hunk, d.annotations).length > 0)
      .map(hunk => {
        const diff = hunkToDiffText(hunk);
        const annots = annotationsForHunk(hunk, d.annotations)
          .map(a => a.category ? `> **[${a.category}] Line ${a.startLine + 1}:** ${a.body}` : `> **Line ${a.startLine + 1}:** ${a.body}`)
          .join('\n');

        return (
          `#### ${hunk.header}\n\n` +
          `\`\`\`diff\n${diff}\n\`\`\`` +
          `\n\n${annots}`
        );
      }).join('\n\n');

    const orphans = orphanAnnotations(d.fileDiff.hunks, d.annotations);
    const orphanSection = orphans.length > 0
      ? '\n\n' +
        orphans.map(a => a.category ? `> **[${a.category}]** ${a.body}` : `> ${a.body}`).join('\n')
      : '';

    return (
      `## \`${d.file.relativePath}\` (${d.file.status})\n\n` +
      hunks +
      orphanSection
    );
  }
}
