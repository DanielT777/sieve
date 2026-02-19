import type { Annotation, AnnotationCategory } from '../review/annotation';

const CATEGORY_INSTRUCTIONS: Record<AnnotationCategory, string> = {
  bug:          'For each [bug]: identify the root cause and suggest a minimal, targeted fix.',
  security:     'For each [security]: assess the OWASP risk level and provide a concrete remediation strategy.',
  performance:  'For each [performance]: suggest algorithmic improvements, caching strategies, or memory optimisations.',
  architecture: 'For each [architecture]: evaluate the design decision, explain the trade-offs, and suggest better alternatives.',
  explain:      'For each [explain]: walk through what the annotated code is interatcting and the scope it has in the codebase step by step, clarifying its intent and behaviour.',
  refactor:     'For each [refactor]: suggest idiomatic improvements that enhance readability without changing behaviour.',
  test:         'For each [test]: propose concrete test cases, edge cases, and a testing strategy for the annotated code that is not covered by the existing tests.',
};

export function collectCategories(annotations: readonly Annotation[]): ReadonlySet<AnnotationCategory> {
  const categories = new Set<AnnotationCategory>();
  for (const annotation of annotations) {
    if (annotation.category) categories.add(annotation.category);
  }
  return categories;
}

export function buildPromptInstructions(categories: ReadonlySet<AnnotationCategory>): string {
  if (categories.size === 0) return 'Review the flagged files and provide general feedback.';
  return [...categories].map(c => CATEGORY_INSTRUCTIONS[c]).join('\n');
}
