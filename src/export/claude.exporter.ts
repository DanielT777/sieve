import type { ExportFileData, ExportResult, ReviewExporter } from './review.exporter';
import { collectCategories, buildPromptInstructions } from './prompt.builder';
import { annotationsForHunk, orphanAnnotations, hunkToDiffText } from './export.utils';

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Exports annotated files as XML-tagged prompt optimised for Claude. */
export class ClaudeExporter implements ReviewExporter {
  readonly id = 'claude';
  readonly label = 'Claude (XML tags)';

  export(files: readonly ExportFileData[]): ExportResult {
    const allAnnotations = files.flatMap(f => [...f.annotations]);
    const instructions = buildPromptInstructions(collectCategories(allAnnotations));
    const sections = files.map(d => this._fileToXml(d)).join('\n\n');
    const content =
      `<review>\n` +
      `<instructions>\n${instructions}\n</instructions>\n\n` +
      sections +
      `\n</review>`;

    return { content, mimeType: 'text/plain', suggestedFilename: 'sieve-review.xml' };
  }

  private _fileToXml(d: ExportFileData): string {
    const hunks = d.fileDiff.hunks
      .filter(hunk => annotationsForHunk(hunk, d.annotations).length > 0)
      .map(hunk => {
        const diff = hunkToDiffText(hunk);
        const annots = annotationsForHunk(hunk, d.annotations)
          .map(a => a.category
            ? `    <annotation line="${a.startLine + 1}" category="${escapeXml(a.category)}">${escapeXml(a.body)}</annotation>`
            : `    <annotation line="${a.startLine + 1}">${escapeXml(a.body)}</annotation>`)
          .join('\n');

        return (
          `  <hunk header="${escapeXml(hunk.header)}">\n` +
          `    <diff>\n${diff}\n    </diff>\n` +
          annots +
          `\n  </hunk>`
        );
      }).join('\n');

    const orphans = orphanAnnotations(d.fileDiff.hunks, d.annotations);
    const orphanXml = orphans.length > 0
      ? '\n' + orphans
          .map(a => a.category
            ? `  <annotation category="${escapeXml(a.category)}">${escapeXml(a.body)}</annotation>`
            : `  <annotation>${escapeXml(a.body)}</annotation>`)
          .join('\n')
      : '';

    return (
      `<file path="${escapeXml(d.file.relativePath)}" status="${d.file.status}">\n` +
      hunks +
      orphanXml +
      `\n</file>`
    );
  }
}
