import type { DiffHunk, DiffLine } from '../diff/diff.model';
import type { Annotation } from '../review/annotation';

/** Returns annotations whose startLine falls within the given hunk's new-file range. */
export function annotationsForHunk(hunk: DiffHunk, annotations: readonly Annotation[]): readonly Annotation[] {
  if (hunk.newLines === 0) return [];
  const start = hunk.newStart - 1; // 0-indexed
  const end = hunk.newStart + hunk.newLines - 2; // 0-indexed, inclusive
  return annotations.filter(a => a.startLine >= start && a.startLine <= end);
}

/** Returns annotations that don't fall within any hunk's range (e.g. file-level annotations at line 0). */
export function orphanAnnotations(hunks: readonly DiffHunk[], annotations: readonly Annotation[]): readonly Annotation[] {
  const matchedIds = new Set<string>();
  for (const hunk of hunks) {
    for (const a of annotationsForHunk(hunk, annotations)) {
      matchedIds.add(a.id);
    }
  }
  return annotations.filter(a => !matchedIds.has(a.id));
}

/**
 * Builds synthetic context-only hunks for orphan annotations on specific lines.
 * Each hunk shows a few surrounding lines so the annotation has code context in the export.
 * File-level annotations (startLine === 0) are skipped — they stay as orphans.
 */
export function buildContextHunks(
  fileUri: string,
  fileLines: readonly string[],
  orphans: readonly Annotation[],
  contextRadius = 3,
): DiffHunk[] {
  return orphans
    .filter(a => a.startLine > 0)
    .map(a => {
      const start = Math.max(0, a.startLine - contextRadius);
      const end = Math.min(fileLines.length - 1, a.endLine + contextRadius);

      const lines: DiffLine[] = [];
      for (let i = start; i <= end; i++) {
        lines.push({
          type: 'context',
          content: fileLines[i] ?? '',
          oldLineNumber: i + 1,
          newLineNumber: i + 1,
        });
      }

      const newStart = start + 1; // 1-indexed
      return {
        id: `${fileUri}:ctx:${newStart}`,
        header: `@@ -${newStart},${lines.length} +${newStart},${lines.length} @@`,
        oldStart: newStart,
        oldLines: lines.length,
        newStart,
        newLines: lines.length,
        lines,
        state: 'unreviewed' as const,
      };
    });
}

/** Rebuilds a raw diff snippet from a hunk's parsed DiffLines. */
export function hunkToDiffText(hunk: DiffHunk): string {
  return hunk.lines
    .map(l => {
      if (l.type === 'added') return `+${l.content}`;
      if (l.type === 'removed') return `-${l.content}`;
      return ` ${l.content}`;
    })
    .join('\n');
}
