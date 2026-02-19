import { describe, it, expect } from 'vitest';
import { parseAnnotationBody } from '../../src/annotations/annotation.parser';

describe('parseAnnotationBody', () => {
  it('extracts a valid category and body from "[bug] memory leak"', () => {
    // Arrange
    const input = '[bug] memory leak in useEffect cleanup';

    // Act
    const result = parseAnnotationBody(input);

    // Assert
    expect(result.category).toBe('bug');
    expect(result.body).toBe('memory leak in useEffect cleanup');
    expect(result.hasExplicitCategory).toBe(true);
  });

  it('is case-insensitive for category tags', () => {
    // Arrange / Act
    const result = parseAnnotationBody('[SECURITY] SQL injection risk');

    // Assert
    expect(result.category).toBe('security');
    expect(result.body).toBe('SQL injection risk');
    expect(result.hasExplicitCategory).toBe(true);
  });

  it('handles mixed case like [Performance]', () => {
    // Arrange / Act
    const result = parseAnnotationBody('[Performance] O(n²) nested loop');

    // Assert
    expect(result.category).toBe('performance');
    expect(result.hasExplicitCategory).toBe(true);
  });

  it.each([
    'bug', 'security', 'performance', 'architecture', 'explain', 'refactor', 'test',
  ] as const)('recognises [%s] as a valid category', (cat) => {
    // Arrange / Act
    const result = parseAnnotationBody(`[${cat}] some text`);

    // Assert
    expect(result.category).toBe(cat);
    expect(result.hasExplicitCategory).toBe(true);
  });

  it('falls back to "explain" for plain text without a tag', () => {
    // Arrange
    const input = 'Why is this function called twice?';

    // Act
    const result = parseAnnotationBody(input);

    // Assert
    expect(result.category).toBeUndefined();
    expect(result.body).toBe('Why is this function called twice?');
    expect(result.hasExplicitCategory).toBe(false);
  });

  it('falls back to undefined for an unrecognised tag', () => {
    // Arrange / Act
    const result = parseAnnotationBody('[nope] something');

    // Assert
    expect(result.category).toBeUndefined();
    expect(result.body).toBe('[nope] something');
    expect(result.hasExplicitCategory).toBe(false);
  });

  it('trims surrounding whitespace', () => {
    // Arrange / Act
    const result = parseAnnotationBody('  [bug]   trailing spaces   ');

    // Assert
    expect(result.category).toBe('bug');
    expect(result.body).toBe('trailing spaces');
  });

  it('preserves multiline body content', () => {
    // Arrange
    const input = '[refactor] first line\nsecond line\nthird line';

    // Act
    const result = parseAnnotationBody(input);

    // Assert
    expect(result.category).toBe('refactor');
    expect(result.body).toBe('first line\nsecond line\nthird line');
  });

  it('returns empty body when tag has no trailing text', () => {
    // Arrange / Act
    const result = parseAnnotationBody('[test]');

    // Assert
    expect(result.category).toBe('test');
    expect(result.body).toBe('');
    expect(result.hasExplicitCategory).toBe(true);
  });

  it('treats empty string as plain text (no category)', () => {
    // Arrange / Act
    const result = parseAnnotationBody('');

    // Assert
    expect(result.category).toBeUndefined();
    expect(result.body).toBe('');
    expect(result.hasExplicitCategory).toBe(false);
  });

  it('does not match brackets mid-text', () => {
    // Arrange — the tag must be at the start
    const input = 'some prefix [bug] real body';

    // Act
    const result = parseAnnotationBody(input);

    // Assert
    expect(result.category).toBeUndefined();
    expect(result.body).toBe('some prefix [bug] real body');
    expect(result.hasExplicitCategory).toBe(false);
  });
});
