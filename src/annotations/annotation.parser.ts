import type { AnnotationCategory } from '../review/annotation';

const VALID_CATEGORIES: ReadonlySet<string> = new Set<AnnotationCategory>([
  'bug', 'security', 'performance', 'architecture', 'explain', 'refactor', 'test',
]);

const CATEGORY_PATTERN = /^\[(\w+)\]\s*([\s\S]*)$/;

function isCategory(value: string): value is AnnotationCategory {
  return VALID_CATEGORIES.has(value);
}

export interface ParsedAnnotation {
  readonly category: AnnotationCategory | undefined;
  readonly body: string;
  /** `true` when the user typed an explicit `[tag]` prefix. */
  readonly hasExplicitCategory: boolean;
}

/**
 * Parses an annotation comment string into its category and body.
 *
 * Expected format: `[category] body text`
 * Returns `undefined` category when the tag is missing or unrecognised.
 */
export function parseAnnotationBody(text: string): ParsedAnnotation {
  const trimmed = text.trim();
  const match = CATEGORY_PATTERN.exec(trimmed);
  if (match && match[1] !== undefined) {
    const tag = match[1].toLowerCase();
    if (isCategory(tag)) {
      return { category: tag, body: (match[2] ?? '').trim(), hasExplicitCategory: true };
    }
  }
  return { category: undefined, body: trimmed, hasExplicitCategory: false };
}
