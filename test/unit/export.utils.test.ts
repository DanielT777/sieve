import { describe, it, expect } from 'vitest';
import {
  annotationsForHunk,
  hunkToDiffText,
  orphanAnnotations,
  buildContextHunks,
  trimHunkAroundAnnotations,
} from '../../src/export/export.utils';
import type { DiffHunk, DiffLine } from '../../src/diff/diff.model';
import type { Annotation } from '../../src/review/annotation';

// ── helpers ──────────────────────────────────────────────────────

function makeHunk(overrides: Partial<DiffHunk> = {}): DiffHunk {
  return {
    id: 'h1',
    header: '@@ -10,5 +10,6 @@',
    oldStart: 10,
    oldLines: 5,
    newStart: 10,
    newLines: 6,
    lines: [],
    state: 'unreviewed',
    ...overrides,
  };
}

function makeAnnotation(startLine: number, overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: `ann-${startLine}`,
    fileUri: '/f.ts',
    startLine,
    endLine: startLine,
    category: 'bug',
    body: `issue at ${startLine}`,
    createdAt: 0,
    resolved: false,
    ...overrides,
  };
}

/** Builds a contiguous range of DiffLines (all 'added') for simulating an added file. */
function makeAddedLines(count: number): DiffLine[] {
  return Array.from({ length: count }, (_, i) => ({
    type: 'added' as const,
    content: `line ${i}`,
    oldLineNumber: undefined,
    newLineNumber: i + 1, // 1-indexed
  }));
}

/** Builds a contiguous range of DiffLines (mixed) for simulating a modified file. */
function makeModifiedLines(newStart: number, count: number): DiffLine[] {
  return Array.from({ length: count }, (_, i) => ({
    type: 'context' as const,
    content: `line ${newStart + i - 1}`,
    oldLineNumber: newStart + i,
    newLineNumber: newStart + i,
  }));
}

// ── annotationsForHunk ──────────────────────────────────────────

describe('annotationsForHunk', () => {
  it('returns annotations whose startLine falls within the hunk range', () => {
    const hunk = makeHunk({ newStart: 10, newLines: 6 });
    const annotations = [
      makeAnnotation(8),  // before hunk → excluded
      makeAnnotation(9),  // first line of hunk (0-indexed) → included
      makeAnnotation(12), // mid hunk → included
      makeAnnotation(14), // last line of hunk → included
      makeAnnotation(15), // after hunk → excluded
    ];

    const result = annotationsForHunk(hunk, annotations);

    expect(result).toHaveLength(3);
    expect(result.map(a => a.startLine)).toEqual([9, 12, 14]);
  });

  it('returns empty array when hunk has newLines=0 (pure deletion)', () => {
    const hunk = makeHunk({ newLines: 0 });
    const result = annotationsForHunk(hunk, [makeAnnotation(10)]);
    expect(result).toEqual([]);
  });

  it('returns empty array when no annotations match', () => {
    const hunk = makeHunk({ newStart: 100, newLines: 3 });
    const result = annotationsForHunk(hunk, [makeAnnotation(0), makeAnnotation(50)]);
    expect(result).toEqual([]);
  });
});

// ── hunkToDiffText ──────────────────────────────────────────────

describe('hunkToDiffText', () => {
  it('rebuilds diff text with +/- prefixes from parsed lines', () => {
    const lines: DiffLine[] = [
      { type: 'context', content: 'unchanged', oldLineNumber: 1, newLineNumber: 1 },
      { type: 'removed', content: 'old line', oldLineNumber: 2, newLineNumber: undefined },
      { type: 'added', content: 'new line', oldLineNumber: undefined, newLineNumber: 2 },
    ];
    const result = hunkToDiffText(makeHunk({ lines }));
    expect(result).toBe(' unchanged\n-old line\n+new line');
  });

  it('returns empty string for a hunk with no lines', () => {
    expect(hunkToDiffText(makeHunk({ lines: [] }))).toBe('');
  });
});

// ── orphanAnnotations ───────────────────────────────────────────

describe('orphanAnnotations', () => {
  it('returns annotations that fall outside all hunks', () => {
    const hunk = makeHunk({ newStart: 10, newLines: 6 });
    const annotations = [
      makeAnnotation(0),  // outside → orphan
      makeAnnotation(12), // inside hunk → matched
    ];

    const result = orphanAnnotations([hunk], annotations);

    expect(result).toHaveLength(1);
    expect(result[0]!.startLine).toBe(0);
  });

  it('returns empty array when all annotations are matched by hunks', () => {
    const hunk = makeHunk({ newStart: 10, newLines: 6 });
    const result = orphanAnnotations([hunk], [makeAnnotation(10), makeAnnotation(12)]);
    expect(result).toEqual([]);
  });

  it('returns all annotations when there are no hunks', () => {
    const result = orphanAnnotations([], [makeAnnotation(0), makeAnnotation(5)]);
    expect(result).toHaveLength(2);
  });
});

// ── buildContextHunks ───────────────────────────────────────────

describe('buildContextHunks', () => {
  const fileLines = [
    'line 0', 'line 1', 'line 2', 'line 3', 'line 4',
    'line 5', 'line 6', 'line 7', 'line 8', 'line 9',
  ];

  it('generates a context hunk around the annotation with 3-line radius', () => {
    const annotation = makeAnnotation(5);

    const result = buildContextHunks('/f.ts', fileLines, [annotation]);

    expect(result).toHaveLength(1);
    const hunk = result[0]!;
    expect(hunk.newStart).toBe(3);
    expect(hunk.newLines).toBe(7);
    expect(hunk.lines).toHaveLength(7);
    expect(hunk.lines.every(l => l.type === 'context')).toBe(true);
    expect(hunk.lines[0]!.content).toBe('line 2');
    expect(hunk.lines[3]!.content).toBe('line 5');
    expect(hunk.lines[6]!.content).toBe('line 8');
  });

  it('clamps to file boundaries', () => {
    const result = buildContextHunks('/f.ts', fileLines, [makeAnnotation(1)]);

    const hunk = result[0]!;
    expect(hunk.newStart).toBe(1);
    expect(hunk.lines[0]!.content).toBe('line 0');
  });

  it('skips file-level annotations (fileLevel: true)', () => {
    const annotation = makeAnnotation(0, { fileLevel: true });
    const result = buildContextHunks('/f.ts', fileLines, [annotation]);
    expect(result).toHaveLength(0);
  });

  it('includes line-0 annotation without fileLevel flag (backward compat)', () => {
    const annotation = makeAnnotation(0);
    const result = buildContextHunks('/f.ts', fileLines, [annotation]);
    expect(result).toHaveLength(1);
    expect(result[0]!.newStart).toBe(1);
  });

  it('annotation in context hunk is matched by annotationsForHunk', () => {
    const annotation = makeAnnotation(5);
    const [hunk] = buildContextHunks('/f.ts', fileLines, [annotation]);

    const matched = annotationsForHunk(hunk!, [annotation]);

    expect(matched).toHaveLength(1);
    expect(matched[0]!.startLine).toBe(5);
  });
});

// ── trimHunkAroundAnnotations ───────────────────────────────────

describe('trimHunkAroundAnnotations', () => {
  // ── Case #1: Modified, annotation in a hunk ──

  it('#1 — modified file: trims hunk to context around annotation', () => {
    // Hunk with 20 context lines (newStart=1, newLines=20)
    const lines: DiffLine[] = Array.from({ length: 20 }, (_, i) => ({
      type: 'context' as const,
      content: `line ${i}`,
      oldLineNumber: i + 1,
      newLineNumber: i + 1,
    }));
    const hunk = makeHunk({ id: 'big', newStart: 1, newLines: 20, lines });

    // Annotation at line 9 (0-indexed) → newLineNumber 10
    const annotation = makeAnnotation(9);

    const result = trimHunkAroundAnnotations(hunk, [annotation]);

    // Should produce 1 sub-hunk: lines 7..13 (indices 6..12, radius=3)
    expect(result).toHaveLength(1);
    expect(result[0]!.lines.length).toBe(7);
    expect(result[0]!.newStart).toBe(7); // first newLineNumber in slice
    expect(result[0]!.lines[3]!.newLineNumber).toBe(10); // annotated line centred
  });

  // ── Case #3: Added file, annotation on lines ──

  it('#3 — added file: trims giant single hunk to annotation context', () => {
    const lines = makeAddedLines(100); // 100-line added file = 1 hunk
    const hunk = makeHunk({
      id: 'added',
      header: '@@ -0,0 +1,100 @@',
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: 100,
      lines,
    });

    // 3 annotations at lines 10, 50, 90 (0-indexed)
    const annotations = [makeAnnotation(10), makeAnnotation(50), makeAnnotation(90)];

    const result = trimHunkAroundAnnotations(hunk, annotations);

    // 3 distant annotations → 3 separate sub-hunks
    expect(result).toHaveLength(3);
    // Each sub-hunk has 7 lines (1 annotated + 3 context on each side)
    for (const sub of result) {
      expect(sub.lines.length).toBe(7);
    }
    // First sub-hunk centred on newLineNumber 11 (0-indexed line 10)
    expect(result[0]!.lines[3]!.newLineNumber).toBe(11);
    // Second centred on 51
    expect(result[1]!.lines[3]!.newLineNumber).toBe(51);
    // Third centred on 91
    expect(result[2]!.lines[3]!.newLineNumber).toBe(91);
  });

  // ── Case #8: Multiple nearby annotations → merged ──

  it('#8 — nearby annotations: merges overlapping ranges into one sub-hunk', () => {
    const lines = makeAddedLines(30);
    const hunk = makeHunk({ newStart: 1, newLines: 30, lines });

    // Two annotations 4 lines apart (0-indexed 10 and 14) → context overlaps
    const annotations = [makeAnnotation(10), makeAnnotation(14)];

    const result = trimHunkAroundAnnotations(hunk, annotations);

    // Should merge into 1 sub-hunk (indices 7..17 → 11 lines)
    expect(result).toHaveLength(1);
    expect(result[0]!.lines.length).toBe(11);
  });

  // ── Case #9: Multiple distant annotations → separate sub-hunks ──

  it('#9 — distant annotations: creates separate sub-hunks', () => {
    const lines = makeAddedLines(50);
    const hunk = makeHunk({ newStart: 1, newLines: 50, lines });

    // Annotations at lines 5 and 40 (0-indexed) — far apart
    const annotations = [makeAnnotation(5), makeAnnotation(40)];

    const result = trimHunkAroundAnnotations(hunk, annotations);

    expect(result).toHaveLength(2);
    // First sub-hunk around line 5
    expect(result[0]!.lines.some(l => l.newLineNumber === 6)).toBe(true);
    // Second sub-hunk around line 40
    expect(result[1]!.lines.some(l => l.newLineNumber === 41)).toBe(true);
  });

  // ── Case #10: Multi-line annotation (50 lines) ──

  it('#10 — multi-line annotation: includes full annotated range + context', () => {
    const lines = makeAddedLines(80);
    const hunk = makeHunk({ newStart: 1, newLines: 80, lines });

    // Annotation spanning lines 20-30 (0-indexed, 11 lines)
    const annotation = makeAnnotation(20, { endLine: 30 });

    const result = trimHunkAroundAnnotations(hunk, [annotation]);

    expect(result).toHaveLength(1);
    // Lines 17..33 (0-indexed indices) → 20-3 to 30+3 → 17 lines
    expect(result[0]!.lines.length).toBe(17);
    // First line is newLineNumber 18 (index 17, 1-indexed)
    expect(result[0]!.newStart).toBe(18);
  });

  // ── Case #11: Modified, big diff (whole file changed) ──

  it('#11 — big modified diff: trims like added file', () => {
    // Simulate a file where every line was changed (removed + added)
    const lines: DiffLine[] = [];
    for (let i = 0; i < 50; i++) {
      lines.push({ type: 'removed', content: `old ${i}`, oldLineNumber: i + 1, newLineNumber: undefined });
      lines.push({ type: 'added', content: `new ${i}`, oldLineNumber: undefined, newLineNumber: i + 1 });
    }
    const hunk = makeHunk({ newStart: 1, newLines: 50, oldLines: 50, lines });

    const annotation = makeAnnotation(25); // mid-file

    const result = trimHunkAroundAnnotations(hunk, [annotation]);

    expect(result).toHaveLength(1);
    // Should contain context around the annotated line, NOT all 100 diff lines
    expect(result[0]!.lines.length).toBeLessThan(lines.length);
    // The annotated newLineNumber=26 should be present
    expect(result[0]!.lines.some(l => l.newLineNumber === 26)).toBe(true);
  });

  // ── Case #12: Annotation on line 0 (first line) ──

  it('#12 — annotation on line 0: includes context from file start', () => {
    const lines = makeAddedLines(20);
    const hunk = makeHunk({ newStart: 1, newLines: 20, lines });

    // Line 0 (0-indexed) → newLineNumber 1
    const annotation = makeAnnotation(0);

    const result = trimHunkAroundAnnotations(hunk, [annotation]);

    expect(result).toHaveLength(1);
    // Line 0 + 3 lines of context below = 4 lines (clamped at start)
    expect(result[0]!.lines.length).toBe(4);
    expect(result[0]!.newStart).toBe(1);
    expect(result[0]!.lines[0]!.newLineNumber).toBe(1);
  });

  // ── Edge cases ──

  it('returns original hunk when it is small enough', () => {
    const lines = makeAddedLines(5);
    const hunk = makeHunk({ newStart: 1, newLines: 5, lines });
    const annotation = makeAnnotation(2);

    const result = trimHunkAroundAnnotations(hunk, [annotation]);

    // 5 lines, radius=3 → all lines kept → returns original hunk
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(hunk.id); // same object, not trimmed
  });

  it('returns empty array when no annotations provided', () => {
    const lines = makeAddedLines(10);
    const hunk = makeHunk({ newStart: 1, newLines: 10, lines });

    const result = trimHunkAroundAnnotations(hunk, []);

    expect(result).toEqual([]);
  });

  it('returns original hunk as fallback when no lines match (removed-only)', () => {
    // A hunk with only removed lines (no newLineNumber)
    const lines: DiffLine[] = Array.from({ length: 5 }, (_, i) => ({
      type: 'removed' as const,
      content: `deleted ${i}`,
      oldLineNumber: i + 1,
      newLineNumber: undefined,
    }));
    const hunk = makeHunk({ newStart: 1, newLines: 0, oldLines: 5, lines });

    const result = trimHunkAroundAnnotations(hunk, [makeAnnotation(2)]);

    // No hits (all lines are removed) → fallback returns original hunk
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(hunk.id);
  });

  it('includes adjacent removed lines in context window', () => {
    // Pattern: context, removed, removed, added (annotated), context
    const lines: DiffLine[] = [
      { type: 'context', content: 'ctx before', oldLineNumber: 9, newLineNumber: 9 },
      { type: 'removed', content: 'old A', oldLineNumber: 10, newLineNumber: undefined },
      { type: 'removed', content: 'old B', oldLineNumber: 11, newLineNumber: undefined },
      { type: 'added', content: 'new line', oldLineNumber: undefined, newLineNumber: 10 },
      { type: 'context', content: 'ctx after', oldLineNumber: 12, newLineNumber: 11 },
      // far away padding
      ...Array.from({ length: 20 }, (_, i) => ({
        type: 'context' as const,
        content: `pad ${i}`,
        oldLineNumber: 13 + i,
        newLineNumber: 12 + i,
      })),
    ];
    const hunk = makeHunk({ newStart: 9, newLines: 23, lines });

    // Annotation on line 9 (0-indexed) → newLineNumber 10
    const annotation = makeAnnotation(9);

    const result = trimHunkAroundAnnotations(hunk, [annotation]);

    expect(result).toHaveLength(1);
    // The removed lines adjacent to the annotated line should be included
    const types = result[0]!.lines.map(l => l.type);
    expect(types).toContain('removed');
  });

  it('generates correct sub-hunk headers', () => {
    const lines = makeAddedLines(50);
    const hunk = makeHunk({
      id: 'src',
      newStart: 1,
      newLines: 50,
      oldStart: 0,
      oldLines: 0,
      lines,
    });

    const annotation = makeAnnotation(20);

    const result = trimHunkAroundAnnotations(hunk, [annotation]);

    expect(result).toHaveLength(1);
    const sub = result[0]!;
    // newStart should be first newLineNumber in slice
    expect(sub.newStart).toBe(18); // 20 - 3 + 1 = 18 (1-indexed)
    expect(sub.newLines).toBe(7);  // 7 added lines
    expect(sub.oldLines).toBe(0);  // all added → no old lines
    expect(sub.header).toBe(`@@ -0,0 +18,7 @@`);
    expect(sub.id).toBe('src:trim:0');
  });
});

// ── Integration: full pipeline scenarios ────────────────────────

describe('export pipeline integration', () => {
  const fileLines = Array.from({ length: 30 }, (_, i) => `content line ${i}`);

  // ── Case #2: Modified, annotation outside all hunks ──

  it('#2 — orphan annotation on unchanged line gets context hunk that is matchable', () => {
    // Hunk covers lines 20-25 (0-indexed 19..24)
    const hunk = makeHunk({ newStart: 20, newLines: 6 });
    // Annotation at line 5 — outside hunk
    const annotation = makeAnnotation(5);

    // Step 1: detect orphan
    const orphans = orphanAnnotations([hunk], [annotation]);
    expect(orphans).toHaveLength(1);

    // Step 2: build context hunk
    const contextHunks = buildContextHunks('/f.ts', fileLines, orphans);
    expect(contextHunks).toHaveLength(1);

    // Step 3: annotation must match the context hunk
    const matched = annotationsForHunk(contextHunks[0]!, [annotation]);
    expect(matched).toHaveLength(1);

    // Step 4: trim (should be no-op for small context hunk)
    const trimmed = trimHunkAroundAnnotations(contextHunks[0]!, matched as Annotation[]);
    expect(trimmed).toHaveLength(1);
    expect(trimmed[0]!.lines.length).toBe(7); // 3 + 1 + 3
  });

  // ── Case #4: File-level flag only ──

  it('#4 — file-level flag: fileLevel annotation is orphan and skipped by buildContextHunks', () => {
    const hunk = makeHunk({ newStart: 10, newLines: 5 });
    const flag = makeAnnotation(0, { fileLevel: true, body: 'needs review' });

    // Step 1: detect orphan — file-level annotation at line 0 falls outside hunk range
    const orphans = orphanAnnotations([hunk], [flag]);
    expect(orphans).toHaveLength(1);

    // Step 2: buildContextHunks skips fileLevel annotations
    const contextHunks = buildContextHunks('/f.ts', fileLines, orphans);
    expect(contextHunks).toHaveLength(0);
  });

  // ── Case #5: Flag + line annotations on same file ──

  it('#5 — flag + line annotation: flag becomes orphan, line annotation gets diff context', () => {
    const lines = makeAddedLines(50);
    const hunk = makeHunk({ newStart: 1, newLines: 50, lines });

    const flag = makeAnnotation(0, { fileLevel: true, body: 'flagged file' });
    const lineAnn = makeAnnotation(25, { body: 'issue here' });
    const allAnnotations = [flag, lineAnn];

    // Both match the giant hunk (newStart=1, range 0..49)
    const matched = annotationsForHunk(hunk, allAnnotations);
    expect(matched).toHaveLength(2);

    // Trim: targetLines from flag → newLineNumber 1, from lineAnn → newLineNumber 26
    // These are far apart → 2 sub-hunks
    const trimmed = trimHunkAroundAnnotations(hunk, matched as Annotation[]);
    expect(trimmed).toHaveLength(2);

    // First sub-hunk around flag (line 0 → newLine 1)
    expect(trimmed[0]!.lines[0]!.newLineNumber).toBe(1);
    // Second sub-hunk around line annotation
    expect(trimmed[1]!.lines.some(l => l.newLineNumber === 26)).toBe(true);
  });

  // ── Case #12: Line-0 annotation (NOT file-level) ──

  it('#12 — line-0 annotation without fileLevel: gets context hunk (not treated as flag)', () => {
    // No hunks near line 0
    const hunk = makeHunk({ newStart: 20, newLines: 5 });
    const annotation = makeAnnotation(0); // no fileLevel → line annotation

    // Step 1: orphan detection
    const orphans = orphanAnnotations([hunk], [annotation]);
    expect(orphans).toHaveLength(1);

    // Step 2: NOT skipped by buildContextHunks (fileLevel is undefined)
    const contextHunks = buildContextHunks('/f.ts', fileLines, orphans);
    expect(contextHunks).toHaveLength(1);
    expect(contextHunks[0]!.newStart).toBe(1); // starts at beginning of file

    // Step 3: annotation matches the context hunk
    const matched = annotationsForHunk(contextHunks[0]!, [annotation]);
    expect(matched).toHaveLength(1);
  });

  // ── Backward compat: old annotations without fileLevel ──

  it('backward compat — old annotation at line 0 without fileLevel is treated as line annotation', () => {
    // Simulates an annotation loaded from old .sieve/annotations.json (no fileLevel field)
    const oldAnnotation: Annotation = {
      id: 'old-1',
      fileUri: '/f.ts',
      startLine: 0,
      endLine: 0,
      category: 'bug',
      body: 'old format',
      createdAt: 0,
      resolved: false,
      // no fileLevel property at all
    };

    // hasLineAnnotations check: !oldAnnotation.fileLevel → !undefined → true
    expect(!oldAnnotation.fileLevel).toBe(true);

    // buildContextHunks: !oldAnnotation.fileLevel → not filtered out
    const contextHunks = buildContextHunks('/f.ts', fileLines, [oldAnnotation]);
    expect(contextHunks).toHaveLength(1);
  });
});
