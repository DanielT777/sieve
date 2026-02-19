import { describe, it, expect } from 'vitest';
import { parseDiff, buildAddedFileDiff } from '../../src/diff/diff.parser';
import type { ChangedFile } from '../../src/diff/diff.model';

const file: ChangedFile = {
  uri: '/workspace/src/index.ts',
  relativePath: 'src/index.ts',
  status: 'modified',
  oldPath: undefined,
};

describe('parseDiff', () => {
  it('parses a single hunk with additions and deletions', () => {
    // Arrange
    const raw = [
      'diff --git a/src/index.ts b/src/index.ts',
      'index abc1234..def5678 100644',
      '--- a/src/index.ts',
      '+++ b/src/index.ts',
      '@@ -10,4 +10,5 @@ function greet() {',
      '   const name = "world";',
      '-  console.log("hello");',
      '+  console.log(`hello ${name}`);',
      '+  console.log("done");',
      '   return name;',
    ].join('\n');

    // Act
    const result = parseDiff(file, raw);

    // Assert
    expect(result.additions).toBe(2);
    expect(result.deletions).toBe(1);
    expect(result.hunks).toHaveLength(1);

    const hunk = result.hunks[0]!;
    expect(hunk.oldStart).toBe(10);
    expect(hunk.oldLines).toBe(4);
    expect(hunk.newStart).toBe(10);
    expect(hunk.newLines).toBe(5);
    expect(hunk.lines).toHaveLength(5);

    expect(hunk.lines[0]).toEqual({
      type: 'context',
      content: '  const name = "world";',
      oldLineNumber: 10,
      newLineNumber: 10,
    });
    expect(hunk.lines[1]).toEqual({
      type: 'removed',
      content: '  console.log("hello");',
      oldLineNumber: 11,
      newLineNumber: undefined,
    });
    expect(hunk.lines[2]).toEqual({
      type: 'added',
      content: '  console.log(`hello ${name}`);',
      oldLineNumber: undefined,
      newLineNumber: 11,
    });
  });

  it('parses multiple hunks in the same file', () => {
    // Arrange
    const raw = [
      'diff --git a/f.ts b/f.ts',
      '--- a/f.ts',
      '+++ b/f.ts',
      '@@ -1,3 +1,3 @@',
      ' line1',
      '-old2',
      '+new2',
      ' line3',
      '@@ -20,3 +20,4 @@',
      ' line20',
      ' line21',
      '+inserted',
      ' line22',
    ].join('\n');

    // Act
    const result = parseDiff(file, raw);

    // Assert
    expect(result.hunks).toHaveLength(2);
    expect(result.hunks[0]!.oldStart).toBe(1);
    expect(result.hunks[1]!.oldStart).toBe(20);
    expect(result.additions).toBe(2);
    expect(result.deletions).toBe(1);
  });

  it('skips the "No newline at end of file" marker', () => {
    // Arrange
    const raw = [
      'diff --git a/f.ts b/f.ts',
      '--- a/f.ts',
      '+++ b/f.ts',
      '@@ -1,2 +1,2 @@',
      '-old line',
      '\\ No newline at end of file',
      '+new line',
      '\\ No newline at end of file',
    ].join('\n');

    // Act
    const result = parseDiff(file, raw);

    // Assert
    expect(result.hunks).toHaveLength(1);
    expect(result.hunks[0]!.lines).toHaveLength(2);
    expect(result.hunks[0]!.lines[0]!.type).toBe('removed');
    expect(result.hunks[0]!.lines[1]!.type).toBe('added');
    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);
  });

  it('returns empty hunks for an empty diff', () => {
    // Arrange / Act
    const result = parseDiff(file, '');

    // Assert
    expect(result.hunks).toEqual([]);
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(0);
    expect(result.file).toBe(file);
  });

  it('handles a new file with only additions', () => {
    // Arrange
    const newFile: ChangedFile = { ...file, status: 'added' };
    const raw = [
      'diff --git a/new.ts b/new.ts',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/new.ts',
      '@@ -0,0 +1,3 @@',
      '+line1',
      '+line2',
      '+line3',
    ].join('\n');

    // Act
    const result = parseDiff(newFile, raw);

    // Assert
    expect(result.additions).toBe(3);
    expect(result.deletions).toBe(0);
    expect(result.hunks[0]!.newStart).toBe(1);
    expect(result.hunks[0]!.lines.every(l => l.type === 'added')).toBe(true);
  });

  it('handles a deleted file with only removals', () => {
    // Arrange
    const deletedFile: ChangedFile = { ...file, status: 'deleted' };
    const raw = [
      'diff --git a/old.ts b/old.ts',
      'deleted file mode 100644',
      '--- a/old.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-line1',
      '-line2',
    ].join('\n');

    // Act
    const result = parseDiff(deletedFile, raw);

    // Assert
    expect(result.additions).toBe(0);
    expect(result.deletions).toBe(2);
    expect(result.hunks[0]!.lines.every(l => l.type === 'removed')).toBe(true);
  });

  it('tracks line numbers correctly across mixed changes', () => {
    // Arrange
    const raw = [
      'diff --git a/f.ts b/f.ts',
      '--- a/f.ts',
      '+++ b/f.ts',
      '@@ -5,6 +5,7 @@',
      ' ctx1',       // old=5 new=5
      '-removed1',   // old=6
      '-removed2',   // old=7
      '+added1',     // new=6
      '+added2',     // new=7
      '+added3',     // new=8
      ' ctx2',       // old=8 new=9
    ].join('\n');

    // Act
    const hunk = parseDiff(file, raw).hunks[0]!;

    // Assert — context line numbers
    expect(hunk.lines[0]).toMatchObject({ type: 'context', oldLineNumber: 5, newLineNumber: 5 });
    // Removed lines only have old line numbers
    expect(hunk.lines[1]).toMatchObject({ type: 'removed', oldLineNumber: 6, newLineNumber: undefined });
    expect(hunk.lines[2]).toMatchObject({ type: 'removed', oldLineNumber: 7, newLineNumber: undefined });
    // Added lines only have new line numbers
    expect(hunk.lines[3]).toMatchObject({ type: 'added', oldLineNumber: undefined, newLineNumber: 6 });
    expect(hunk.lines[4]).toMatchObject({ type: 'added', oldLineNumber: undefined, newLineNumber: 7 });
    expect(hunk.lines[5]).toMatchObject({ type: 'added', oldLineNumber: undefined, newLineNumber: 8 });
    // Context after changes
    expect(hunk.lines[6]).toMatchObject({ type: 'context', oldLineNumber: 8, newLineNumber: 9 });
  });

  it('assigns stable hunk IDs from file uri and line positions', () => {
    // Arrange
    const raw = [
      'diff --git a/f.ts b/f.ts',
      '--- a/f.ts',
      '+++ b/f.ts',
      '@@ -1,1 +1,1 @@',
      '-a',
      '+b',
    ].join('\n');

    // Act
    const hunk = parseDiff(file, raw).hunks[0]!;

    // Assert
    expect(hunk.id).toBe(`${file.uri}:1:1`);
  });
});

describe('buildAddedFileDiff', () => {
  const addedFile: ChangedFile = {
    uri: '/workspace/src/new.ts',
    relativePath: 'src/new.ts',
    status: 'added',
    oldPath: undefined,
  };

  it('generates a single all-added hunk from file content', () => {
    // Arrange
    const content = 'line1\nline2\nline3\n';

    // Act
    const result = buildAddedFileDiff(addedFile, content);

    // Assert
    expect(result.hunks).toHaveLength(1);
    expect(result.additions).toBe(3);
    expect(result.deletions).toBe(0);

    const hunk = result.hunks[0]!;
    expect(hunk.header).toBe('@@ -0,0 +1,3 @@');
    expect(hunk.oldStart).toBe(0);
    expect(hunk.oldLines).toBe(0);
    expect(hunk.newStart).toBe(1);
    expect(hunk.newLines).toBe(3);
    expect(hunk.lines).toHaveLength(3);
    expect(hunk.lines.every(l => l.type === 'added')).toBe(true);
    expect(hunk.lines[0]).toEqual({
      type: 'added',
      content: 'line1',
      oldLineNumber: undefined,
      newLineNumber: 1,
    });
  });

  it('handles file without trailing newline', () => {
    // Arrange
    const content = 'only line';

    // Act
    const result = buildAddedFileDiff(addedFile, content);

    // Assert
    expect(result.hunks[0]!.lines).toHaveLength(1);
    expect(result.additions).toBe(1);
  });

  it('handles empty file', () => {
    // Act
    const result = buildAddedFileDiff(addedFile, '');

    // Assert
    expect(result.hunks[0]!.lines).toHaveLength(0);
    expect(result.additions).toBe(0);
  });
});
