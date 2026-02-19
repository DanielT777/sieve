import type { ChangedFile, FileDiff, DiffHunk, DiffLine } from './diff.model';

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Builds a synthetic FileDiff for a newly added (untracked) file.
 *
 * `git diff HEAD` returns nothing for these files, so we treat the
 * entire content as a single "all added" hunk.
 */
export function buildAddedFileDiff(file: ChangedFile, content: string): FileDiff {
  const sourceLines = content.split('\n');
  // Remove trailing empty line from final newline
  if (sourceLines.length > 0 && sourceLines[sourceLines.length - 1] === '') {
    sourceLines.pop();
  }

  const lines: DiffLine[] = sourceLines.map((text, i) => ({
    type: 'added',
    content: text,
    oldLineNumber: undefined,
    newLineNumber: i + 1,
  }));

  const hunk: DiffHunk = {
    id: `${file.uri}:0:1`,
    header: `@@ -0,0 +1,${lines.length} @@`,
    oldStart: 0,
    oldLines: 0,
    newStart: 1,
    newLines: lines.length,
    lines,
    state: 'unreviewed',
  };

  return { file, hunks: [hunk], additions: lines.length, deletions: 0 };
}

/**
 * Parses a raw `git diff` string into a structured FileDiff.
 *
 * Pure function — no side effects, no I/O.
 */
export function parseDiff(file: ChangedFile, raw: string): FileDiff {
  const lines = raw.split('\n');
  const hunks: DiffHunk[] = [];
  let additions = 0;
  let deletions = 0;
  let i = 0;

  // Skip the file header (diff --git, index, ---, +++).
  while (i < lines.length && !(lines[i] ?? '').startsWith('@@')) i++;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const headerMatch = HUNK_HEADER_RE.exec(line);
    if (!headerMatch) { i++; continue; }

    const oldStart = parseInt(headerMatch[1] ?? '1', 10);
    const oldLines = headerMatch[2] !== undefined ? parseInt(headerMatch[2], 10) : 1;
    const newStart = parseInt(headerMatch[3] ?? '1', 10);
    const newLines = headerMatch[4] !== undefined ? parseInt(headerMatch[4], 10) : 1;
    i++;

    const hunkLines: DiffLine[] = [];
    let oldLineNum = oldStart;
    let newLineNum = newStart;

    while (i < lines.length && !(lines[i] ?? '').startsWith('@@') && !(lines[i] ?? '').startsWith('diff ')) {
      const hunkLine = lines[i] ?? '';
      if (hunkLine.startsWith('\\ ')) { i++; continue; }
      if (hunkLine.startsWith('+')) {
        hunkLines.push({ type: 'added', content: hunkLine.slice(1), oldLineNumber: undefined, newLineNumber: newLineNum++ });
        additions++;
      } else if (hunkLine.startsWith('-')) {
        hunkLines.push({ type: 'removed', content: hunkLine.slice(1), oldLineNumber: oldLineNum++, newLineNumber: undefined });
        deletions++;
      } else {
        hunkLines.push({ type: 'context', content: hunkLine.slice(1), oldLineNumber: oldLineNum++, newLineNumber: newLineNum++ });
      }
      i++;
    }

    hunks.push({
      id: `${file.uri}:${oldStart}:${newStart}`,
      header: line,
      oldStart,
      oldLines,
      newStart,
      newLines,
      lines: hunkLines,
      state: 'unreviewed',
    });
  }

  return { file, hunks, additions, deletions };
}
