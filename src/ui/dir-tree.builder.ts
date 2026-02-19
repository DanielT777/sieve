import type { ChangedFile } from '../diff/diff.model';
import type { TriageManager } from '../review/triage.manager';
import { FolderItem } from './folder.item';
import { FileItem } from './file.item';

interface DirTree {
  dirs: Map<string, DirTree>;
  files: ChangedFile[];
}

interface TreeResult {
  items: (FolderItem | FileItem)[];
  uris: string[];
}

function buildDirTree(files: readonly ChangedFile[]): DirTree {
  const root: DirTree = { dirs: new Map(), files: [] };
  for (const file of files) {
    const parts = file.relativePath.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i] ?? '';
      let subDir = node.dirs.get(part);
      if (!subDir) {
        subDir = { dirs: new Map(), files: [] };
        node.dirs.set(part, subDir);
      }
      node = subDir;
    }
    node.files.push(file);
  }
  return root;
}

function treeToItems(tree: DirTree, triage: TriageManager): TreeResult {
  const items: (FolderItem | FileItem)[] = [];
  const allUris: string[] = [];

  const sortedDirs = [...tree.dirs.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [name, subtree] of sortedDirs) {
    const result = treeToItems(subtree, triage);
    items.push(new FolderItem(name, result.items, triage.computeAggregateState(result.uris), result.uris.length));
    allUris.push(...result.uris);
  }

  const sortedFiles = [...tree.files].sort((a, b) => {
    const nameA = a.relativePath.split('/').pop() ?? '';
    const nameB = b.relativePath.split('/').pop() ?? '';
    return nameA.localeCompare(nameB);
  });
  for (const file of sortedFiles) {
    items.push(new FileItem(file, triage.getState(file.uri)));
    allUris.push(file.uri);
  }

  return { items, uris: allUris };
}

/** Converts a flat file list into a sorted, hierarchical tree of FolderItems and FileItems. */
export function buildReviewTree(
  files: readonly ChangedFile[],
  triage: TriageManager,
): (FolderItem | FileItem)[] {
  return treeToItems(buildDirTree(files), triage).items;
}
