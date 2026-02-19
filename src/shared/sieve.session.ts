import type * as vscode from 'vscode';
import type { ReviewDeskProvider, ReviewDeskItem } from '../ui/review-desk.provider';
import type { TriageManager } from '../review/triage.manager';
import type { AnnotationController } from '../annotations/annotation.controller';
import type { AnnotationStore } from '../annotations/annotation.store';
import type { ExportService } from '../export/export.service';

export interface SieveSession {
  treeView: vscode.TreeView<ReviewDeskItem>;
  treeProvider: ReviewDeskProvider;
  triage: TriageManager;
  annotations: AnnotationStore;
  annotationController: AnnotationController;
  exportService: ExportService;
}
