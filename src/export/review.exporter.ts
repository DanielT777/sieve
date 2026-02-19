import type { ChangedFile, FileDiff } from '../diff/diff.model';
import type { Annotation } from '../review/annotation';

/** Data for a single annotated file in an export. Hunks only — no full file content. */
export interface ExportFileData {
  readonly file: ChangedFile;
  readonly fileDiff: FileDiff;
  readonly annotations: readonly Annotation[];
}

/** The output produced by a ReviewExporter. */
export interface ExportResult {
  readonly content: string;
  readonly mimeType: 'text/plain' | 'text/markdown';
  readonly suggestedFilename?: string;
}

/** Contract for all export formats. */
export interface ReviewExporter {
  readonly id: string;
  readonly label: string;
  export(files: readonly ExportFileData[]): ExportResult;
}
