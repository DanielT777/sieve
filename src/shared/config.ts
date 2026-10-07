/** Centralized constants — all magic strings live here. */

export const SIEVE_DIR = '.sieve';
export const TRIAGE_FILE = 'triage.json';
export const ANNOTATIONS_FILE = 'annotations.json';
export const WORKSPACE_FILE = 'workspace.json';

export const Commands = {
  refresh: 'sieve.refresh',
  chooseComparison: 'sieve.chooseComparison',
  changeComparisonBase: 'sieve.changeComparisonBase',
  changeComparisonTarget: 'sieve.changeComparisonTarget',
  markReviewed: 'sieve.markReviewed',
  flag: 'sieve.flag',
  filterByStatus: 'sieve.filterByStatus',
  export: 'sieve.export',
  openDiff: 'sieve.openDiff',
  submitAnnotation: 'sieve.submitAnnotation',
  cycleCategory: 'sieve.cycleCategory',
  deleteAnnotation: 'sieve.deleteAnnotation',
  clearReview: 'sieve.clearReview',
  installAgentSkill: 'sieve.installAgentSkill',
} as const;
