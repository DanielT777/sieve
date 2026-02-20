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
 * File-level annotations are skipped — they stay as orphans.
 */
export function buildContextHunks(
  fileUri: string,
  fileLines: readonly string[],
  orphans: readonly Annotation[],
  contextRadius = 3,
): DiffHunk[] {
  return orphans
    .filter(a => !a.fileLevel)
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

/**
 * Trims a hunk to only include lines surrounding the given annotations,
 * plus `contextRadius` lines of context on each side.
 *
 * When a hunk is very large (e.g. an entire added file treated as one hunk),
 * this avoids dumping the full content into the export — only the slices
 * relevant to annotations are kept. Multiple nearby annotations merge into
 * a single sub-hunk; distant annotations produce separate sub-hunks.
 *
 * Complexity: O(A·S + L) where A = annotations, S = avg annotation span, L = hunk lines.
 */
export function trimHunkAroundAnnotations(
  hunk: DiffHunk,
  annotations: readonly Annotation[],
  contextRadius = 3,
): DiffHunk[] {
  if (annotations.length === 0) return [];

  const lines = hunk.lines;

  // Pre-compute the set of annotated newLineNumbers (1-indexed).
  const targetLines = new Set<number>();
  for (const a of annotations) {
    for (let n = a.startLine + 1; n <= a.endLine + 1; n++) targetLines.add(n);
  }

  // Single pass: collect hunk-array indices whose newLineNumber is targeted.
  // Result is already sorted since we iterate in order.
  const hits: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]!.newLineNumber;
    if (ln !== undefined && targetLines.has(ln)) hits.push(i);
  }

  if (hits.length === 0) return [hunk];

  // Expand each hit by contextRadius and merge overlapping ranges on the fly.
  const ranges: { start: number; end: number }[] = [];
  for (const idx of hits) {
    const lo = Math.max(0, idx - contextRadius);
    const hi = Math.min(lines.length - 1, idx + contextRadius);
    const prev = ranges[ranges.length - 1];
    if (prev && lo <= prev.end + 1) {
      prev.end = Math.max(prev.end, hi);
    } else {
      ranges.push({ start: lo, end: hi });
    }
  }

  // If one range covers the whole hunk, return as-is.
  if (ranges.length === 1 && ranges[0]!.start === 0 && ranges[0]!.end >= lines.length - 1) {
    return [hunk];
  }

  // Create one sub-hunk per range.
  return ranges.map((range, idx) => {
    const sliced = lines.slice(range.start, range.end + 1);

    const newLines = sliced.filter(l => l.type !== 'removed').length;
    const oldLines = sliced.filter(l => l.type !== 'added').length;
    const newStart = sliced.find(l => l.newLineNumber !== undefined)?.newLineNumber ?? hunk.newStart;
    const oldStart = sliced.find(l => l.oldLineNumber !== undefined)?.oldLineNumber ?? hunk.oldStart;

    return {
      id: `${hunk.id}:trim:${idx}`,
      header: `@@ -${oldStart},${oldLines} +${newStart},${newLines} @@`,
      oldStart,
      oldLines,
      newStart,
      newLines,
      lines: sliced,
      state: hunk.state,
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
