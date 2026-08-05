/** Centralized constants — all magic strings live here. */

export const SIEVE_DIR = '.sieve';
export const TRIAGE_FILE = `${SIEVE_DIR}/triage.json`;
export const ANNOTATIONS_FILE = `${SIEVE_DIR}/annotations.json`;

export const Commands = {
  refresh: 'sieve.refresh',
  chooseComparison: 'sieve.chooseComparison',
  markReviewed: 'sieve.markReviewed',
  flag: 'sieve.flag',
  filterByStatus: 'sieve.filterByStatus',
  export: 'sieve.export',
  openDiff: 'sieve.openDiff',
  submitAnnotation: 'sieve.submitAnnotation',
  cycleCategory: 'sieve.cycleCategory',
  deleteAnnotation: 'sieve.deleteAnnotation',
  clearReview: 'sieve.clearReview',
} as const;
