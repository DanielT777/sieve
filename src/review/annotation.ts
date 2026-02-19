/** Ordered list of annotation categories — used for cycling. */
export const ANNOTATION_CATEGORIES = ['bug', 'security', 'performance', 'architecture', 'explain', 'refactor', 'test'] as const;

/** Categories for review annotations. */
export type AnnotationCategory = (typeof ANNOTATION_CATEGORIES)[number];

/** A reviewer comment attached to a specific line range in a file. */
export interface Annotation {
  readonly id: string;
  readonly fileUri: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly category?: AnnotationCategory;
  readonly body: string;
  readonly createdAt: number; // Unix timestamp (ms)
  readonly resolved: boolean;
}
