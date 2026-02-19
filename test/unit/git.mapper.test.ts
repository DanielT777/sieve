import { describe, it, expect } from 'vitest';
import { toFileStatus, toRelativePath } from '../../src/diff/git.mapper';
import { Status } from '../../src/git';

describe('toFileStatus', () => {
  it('maps INDEX_ADDED to "added"', () => {
    expect(toFileStatus(Status.INDEX_ADDED)).toBe('added');
  });

  it('maps UNTRACKED to "added"', () => {
    expect(toFileStatus(Status.UNTRACKED)).toBe('added');
  });

  it('maps INDEX_DELETED to "deleted"', () => {
    expect(toFileStatus(Status.INDEX_DELETED)).toBe('deleted');
  });

  it('maps DELETED to "deleted"', () => {
    expect(toFileStatus(Status.DELETED)).toBe('deleted');
  });

  it('maps INDEX_RENAMED to "renamed"', () => {
    expect(toFileStatus(Status.INDEX_RENAMED)).toBe('renamed');
  });

  it('defaults to "modified" for MODIFIED status', () => {
    expect(toFileStatus(Status.MODIFIED)).toBe('modified');
  });

  it('defaults to "modified" for any unmapped status', () => {
    expect(toFileStatus(Status.BOTH_MODIFIED)).toBe('modified');
    expect(toFileStatus(Status.INDEX_COPIED)).toBe('modified');
  });
});

describe('toRelativePath', () => {
  it('strips the root path to produce a relative path', () => {
    // Arrange
    const root = '/Users/dev/project';
    const absolute = '/Users/dev/project/src/index.ts';

    // Act
    const rel = toRelativePath(root, absolute);

    // Assert
    expect(rel).toBe('src/index.ts');
  });

  it('handles a root path with trailing slash', () => {
    // Arrange
    const root = '/Users/dev/project/';
    const absolute = '/Users/dev/project/src/index.ts';

    // Act
    const rel = toRelativePath(root, absolute);

    // Assert
    expect(rel).toBe('src/index.ts');
  });

  it('normalises backslashes to forward slashes', () => {
    // Arrange — simulates a mixed-separator path (common on Windows with VS Code git)
    const root = '/Users/dev/project';
    const absolute = '/Users/dev/project/src\\nested\\index.ts';

    // Act
    const rel = toRelativePath(root, absolute);

    // Assert
    expect(rel).toBe('src/nested/index.ts');
  });

  it('returns just the filename for a file at the root', () => {
    // Arrange
    const root = '/workspace';
    const absolute = '/workspace/package.json';

    // Act
    const rel = toRelativePath(root, absolute);

    // Assert
    expect(rel).toBe('package.json');
  });

  it('handles deeply nested paths', () => {
    // Arrange
    const root = '/workspace';
    const absolute = '/workspace/src/deep/nested/dir/file.ts';

    // Act
    const rel = toRelativePath(root, absolute);

    // Assert
    expect(rel).toBe('src/deep/nested/dir/file.ts');
  });
});
