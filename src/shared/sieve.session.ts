import type * as vscode from 'vscode';
import type { ReviewDeskProvider, ReviewDeskItem } from '../ui/review-desk.provider';
import type { AnnotationController } from '../annotations/annotation.controller';
import type { ExportService } from '../export/export.service';
import type { ReviewRepository } from '../review/review.repository';

export interface SieveSession {
  treeView: vscode.TreeView<ReviewDeskItem>;
  treeProvider: ReviewDeskProvider;
  annotationController: AnnotationController;
  exportService: ExportService;
  /** Repositories in the Review Desk — usually one, or a repository and its worktrees. */
  repositories(): readonly ReviewRepository[];
}
