import { describe, it, expect } from 'vitest';
import { collectCategories, buildPromptInstructions } from '../../src/export/prompt.builder';
import type { Annotation, AnnotationCategory } from '../../src/review/annotation';

function fakeAnnotation(category: AnnotationCategory): Annotation {
  return {
    id: 'ann-1',
    fileUri: '/f.ts',
    startLine: 0,
    endLine: 0,
    category,
    body: 'test',
    createdAt: 0,
    resolved: false,
  };
}

describe('collectCategories', () => {
  it('collects unique categories across multiple annotations', () => {
    // Arrange
    const annotations = [
      fakeAnnotation('bug'),
      fakeAnnotation('security'),
      fakeAnnotation('bug'),
      fakeAnnotation('test'),
    ];

    // Act
    const categories = collectCategories(annotations);

    // Assert
    expect(categories).toEqual(new Set(['bug', 'security', 'test']));
  });

  it('returns empty set when there are no annotations', () => {
    // Arrange / Act
    const categories = collectCategories([]);

    // Assert
    expect(categories.size).toBe(0);
  });
});

describe('buildPromptInstructions', () => {
  it('returns a general fallback when no categories are present', () => {
    // Arrange / Act
    const result = buildPromptInstructions(new Set());

    // Assert
    expect(result).toContain('general feedback');
  });

  it('returns instructions for each category', () => {
    // Arrange
    const categories = new Set<AnnotationCategory>(['bug', 'performance']);

    // Act
    const result = buildPromptInstructions(categories);

    // Assert
    expect(result).toContain('[bug]');
    expect(result).toContain('[performance]');
    expect(result).not.toContain('[security]');
  });

  it('returns one instruction per category, joined by newlines', () => {
    // Arrange
    const categories = new Set<AnnotationCategory>(['refactor', 'test']);

    // Act
    const lines = buildPromptInstructions(categories).split('\n');

    // Assert
    expect(lines).toHaveLength(2);
  });
});
