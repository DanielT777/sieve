import { describe, it, expect } from 'vitest';
import { GenericLlmExporter } from '../../src/export/generic-llm.exporter';
import { ClaudeExporter } from '../../src/export/claude.exporter';
import { MarkdownExporter } from '../../src/export/markdown.exporter';
import type { ExportFileData } from '../../src/export/review.exporter';
import type { DiffHunk, DiffLine } from '../../src/diff/diff.model';
import type { Annotation } from '../../src/review/annotation';

// ── helpers ──────────────────────────────────────────────────────

function makeLine(type: DiffLine['type'], content: string, newLine: number): DiffLine {
  return {
    type,
    content,
    oldLineNumber: type === 'added' ? undefined : newLine,
    newLineNumber: type === 'removed' ? undefined : newLine,
  };
}

function makeHunk(id: string, newStart: number, lines: DiffLine[]): DiffHunk {
  return {
    id,
    header: `@@ -${newStart},${lines.length} +${newStart},${lines.length} @@`,
    oldStart: newStart,
    oldLines: lines.length,
    newStart,
    newLines: lines.length,
    lines,
    state: 'unreviewed',
  };
}

function makeAnnotation(startLine: number, body: string): Annotation {
  return {
    id: `ann-${startLine}`,
    fileUri: '/workspace/src/foo.ts',
    startLine,
    endLine: startLine,
    category: 'bug',
    body,
    createdAt: 0,
    resolved: false,
  };
}

/**
 * Builds a payload with two hunks but only one has an annotation.
 * The test verifies only the annotated hunk appears in the output.
 */
function buildTwoHunkPayload(): ExportFileData[] {
  const hunkA = makeHunk('h1', 5, [
    makeLine('context', 'line 5', 5),
    makeLine('removed', 'old 6', 6),
    makeLine('added', 'new 6', 6),
  ]);
  const hunkB = makeHunk('h2', 50, [
    makeLine('context', 'line 50', 50),
    makeLine('added', 'new 51', 51),
  ]);

  // Annotation on line 5 → only hunkA (newStart=5, newLines=3 → range 4..6 0-indexed)
  const annotation = makeAnnotation(5, 'wrong value');

  return [{
    file: { uri: '/workspace/src/foo.ts', relativePath: 'src/foo.ts', status: 'modified', oldPath: undefined },
    fileDiff: { file: { uri: '/workspace/src/foo.ts', relativePath: 'src/foo.ts', status: 'modified', oldPath: undefined }, hunks: [hunkA, hunkB], additions: 2, deletions: 1 },
    annotations: [annotation],
  }];
}

// ── tests ────────────────────────────────────────────────────────

describe('exporters only include annotated hunks', () => {
  const payload = buildTwoHunkPayload();

  it('GenericLlmExporter omits unannotated hunks', () => {
    const result = new GenericLlmExporter().export(payload);

    // hunkA header should be present
    expect(result.content).toContain('@@ -5,3 +5,3 @@');
    // hunkB header should NOT be present
    expect(result.content).not.toContain('@@ -50,2 +50,2 @@');
    // annotation body should appear
    expect(result.content).toContain('wrong value');
  });

  it('ClaudeExporter omits unannotated hunks', () => {
    const result = new ClaudeExporter().export(payload);

    expect(result.content).toContain('header="@@ -5,3 +5,3 @@"');
    expect(result.content).not.toContain('header="@@ -50,2 +50,2 @@"');
    expect(result.content).toContain('wrong value');
  });

  it('MarkdownExporter omits unannotated hunks', () => {
    const result = new MarkdownExporter().export(payload);

    expect(result.content).toContain('-old 6');
    expect(result.content).not.toContain('new 51');
    expect(result.content).toContain('wrong value');
  });
});
