import { describe, it, expect } from 'vitest';
import { annotationsForHunk, hunkToDiffText, orphanAnnotations, buildContextHunks } from '../../src/export/export.utils';
import type { DiffHunk, DiffLine } from '../../src/diff/diff.model';
import type { Annotation } from '../../src/review/annotation';

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

function makeAnnotation(startLine: number): Annotation {
  return {
    id: `ann-${startLine}`,
    fileUri: '/f.ts',
    startLine,
    endLine: startLine,
    category: 'bug',
    body: `issue at ${startLine}`,
    createdAt: 0,
    resolved: false,
  };
}

describe('annotationsForHunk', () => {
  it('returns annotations whose startLine falls within the hunk range', () => {
    // Arrange — hunk covers new lines 10-15 (newStart=10, newLines=6)
    // 0-indexed: lines 9..14
    const hunk = makeHunk({ newStart: 10, newLines: 6 });
    const annotations = [
      makeAnnotation(8),  // before hunk → excluded
      makeAnnotation(9),  // first line of hunk (0-indexed) → included
      makeAnnotation(12), // mid hunk → included
      makeAnnotation(14), // last line of hunk → included
      makeAnnotation(15), // after hunk → excluded
    ];

    // Act
    const result = annotationsForHunk(hunk, annotations);

    // Assert
    expect(result).toHaveLength(3);
    expect(result.map(a => a.startLine)).toEqual([9, 12, 14]);
  });

  it('returns empty array when hunk has newLines=0 (pure deletion)', () => {
    // Arrange
    const hunk = makeHunk({ newLines: 0 });
    const annotations = [makeAnnotation(10)];

    // Act
    const result = annotationsForHunk(hunk, annotations);

    // Assert
    expect(result).toEqual([]);
  });

  it('returns empty array when no annotations match', () => {
    // Arrange
    const hunk = makeHunk({ newStart: 100, newLines: 3 });
    const annotations = [makeAnnotation(0), makeAnnotation(50)];

    // Act
    const result = annotationsForHunk(hunk, annotations);

    // Assert
    expect(result).toEqual([]);
  });
});

describe('hunkToDiffText', () => {
  it('rebuilds diff text with +/- prefixes from parsed lines', () => {
    // Arrange
    const lines: DiffLine[] = [
      { type: 'context', content: 'unchanged', oldLineNumber: 1, newLineNumber: 1 },
      { type: 'removed', content: 'old line', oldLineNumber: 2, newLineNumber: undefined },
      { type: 'added', content: 'new line', oldLineNumber: undefined, newLineNumber: 2 },
    ];
    const hunk = makeHunk({ lines });

    // Act
    const result = hunkToDiffText(hunk);

    // Assert
    expect(result).toBe(' unchanged\n-old line\n+new line');
  });

  it('returns empty string for a hunk with no lines', () => {
    // Arrange
    const hunk = makeHunk({ lines: [] });

    // Act / Assert
    expect(hunkToDiffText(hunk)).toBe('');
  });
});

describe('orphanAnnotations', () => {
  it('returns file-level annotations (line 0) that fall outside all hunks', () => {
    // Arrange — hunk covers lines 9..14 (0-indexed)
    const hunk = makeHunk({ newStart: 10, newLines: 6 });
    const annotations = [
      makeAnnotation(0),  // file-level → orphan
      makeAnnotation(12), // inside hunk → matched
    ];

    // Act
    const result = orphanAnnotations([hunk], annotations);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]!.startLine).toBe(0);
  });

  it('returns empty array when all annotations are matched by hunks', () => {
    // Arrange
    const hunk = makeHunk({ newStart: 10, newLines: 6 });
    const annotations = [makeAnnotation(10), makeAnnotation(12)];

    // Act
    const result = orphanAnnotations([hunk], annotations);

    // Assert
    expect(result).toEqual([]);
  });

  it('returns all annotations when there are no hunks', () => {
    // Arrange
    const annotations = [makeAnnotation(0), makeAnnotation(5)];

    // Act
    const result = orphanAnnotations([], annotations);

    // Assert
    expect(result).toHaveLength(2);
  });
});

describe('buildContextHunks', () => {
  const fileLines = [
    'line 0', 'line 1', 'line 2', 'line 3', 'line 4',
    'line 5', 'line 6', 'line 7', 'line 8', 'line 9',
  ];

  it('generates a context hunk around the annotation with 3-line radius', () => {
    // Arrange — annotation on line 5 (0-indexed)
    const annotation = makeAnnotation(5);

    // Act
    const result = buildContextHunks('/f.ts', fileLines, [annotation]);

    // Assert
    expect(result).toHaveLength(1);
    const hunk = result[0]!;
    // radius=3 → lines 2..8 (0-indexed) → newStart=3 (1-indexed), 7 lines
    expect(hunk.newStart).toBe(3);
    expect(hunk.newLines).toBe(7);
    expect(hunk.lines).toHaveLength(7);
    expect(hunk.lines.every(l => l.type === 'context')).toBe(true);
    expect(hunk.lines[0]!.content).toBe('line 2');
    expect(hunk.lines[3]!.content).toBe('line 5'); // the annotated line
    expect(hunk.lines[6]!.content).toBe('line 8');
  });

  it('clamps to file boundaries', () => {
    // Arrange — annotation on line 1, radius would go before line 0
    const annotation = makeAnnotation(1);

    // Act
    const result = buildContextHunks('/f.ts', fileLines, [annotation]);

    // Assert
    const hunk = result[0]!;
    expect(hunk.newStart).toBe(1); // clamped to start
    expect(hunk.lines[0]!.content).toBe('line 0');
  });

  it('skips file-level annotations (startLine === 0)', () => {
    // Arrange
    const annotation = makeAnnotation(0);

    // Act
    const result = buildContextHunks('/f.ts', fileLines, [annotation]);

    // Assert
    expect(result).toHaveLength(0);
  });

  it('annotation in context hunk is matched by annotationsForHunk', () => {
    // Arrange — this is the key integration check
    const annotation = makeAnnotation(5);
    const [hunk] = buildContextHunks('/f.ts', fileLines, [annotation]);

    // Act
    const matched = annotationsForHunk(hunk!, [annotation]);

    // Assert — the annotation must be found inside the generated hunk
    expect(matched).toHaveLength(1);
    expect(matched[0]!.startLine).toBe(5);
  });
});
