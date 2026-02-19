import * as fs from 'fs/promises';
import * as path from 'path';
import type { Annotation, AnnotationCategory } from '../review/annotation';
import { ANNOTATIONS_FILE } from '../shared/config';
import { logger } from '../shared/logger';

/** Persists annotations to `.sieve/annotations.json`. */
export class AnnotationStore {
  private _annotations: Annotation[] = [];
  private readonly _filePath: string;

  private _byId = new Map<string, Annotation>();
  private _byFileUri = new Map<string, Annotation[]>();

  constructor(workspacePath: string) {
    this._filePath = path.join(workspacePath, ANNOTATIONS_FILE);
  }

  async load(): Promise<readonly Annotation[]> {
    try {
      const raw = await fs.readFile(this._filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);

      if (!Array.isArray(parsed) || !parsed.every(v => AnnotationStore._isAnnotation(v))) {
        logger.warn('Annotations file contains invalid data — starting fresh.');
        this._annotations = [];
      } else {
        this._annotations = parsed;
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error('Failed to load annotations', err);
      }
      this._annotations = [];
    }
    this._rebuildIndexes();
    return this._annotations;
  }

  async add(annotation: Annotation): Promise<void> {
    this._annotations.push(annotation);
    this._indexOne(annotation);
    await this._persist();
  }

  getAll(): readonly Annotation[] {
    return this._annotations;
  }

  getById(id: string): Annotation | undefined {
    return this._byId.get(id);
  }

  getByFileUri(uri: string): readonly Annotation[] {
    return this._byFileUri.get(uri) ?? [];
  }

  async remove(id: string): Promise<void> {
    this._annotations = this._annotations.filter(a => a.id !== id);
    this._rebuildIndexes();
    await this._persist();
  }

  async updateCategory(id: string, category: AnnotationCategory | undefined): Promise<void> {
    this._annotations = this._annotations.map(a =>
      a.id === id ? { ...a, category } : a,
    );
    this._rebuildIndexes();
    await this._persist();
  }

  async clearAll(): Promise<void> {
    this._annotations = [];
    this._byId.clear();
    this._byFileUri.clear();
    await this._persist();
  }

  private _rebuildIndexes(): void {
    this._byId.clear();
    this._byFileUri.clear();
    for (const a of this._annotations) {
      this._indexOne(a);
    }
  }

  private _indexOne(a: Annotation): void {
    this._byId.set(a.id, a);
    const list = this._byFileUri.get(a.fileUri);
    if (list) list.push(a);
    else this._byFileUri.set(a.fileUri, [a]);
  }

  private static _isAnnotation(value: unknown): value is Annotation {
    if (typeof value !== 'object' || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
      typeof v.id === 'string' &&
      typeof v.fileUri === 'string' &&
      typeof v.startLine === 'number' &&
      typeof v.endLine === 'number' &&
      typeof v.category === 'string' &&
      typeof v.body === 'string' &&
      typeof v.createdAt === 'number' &&
      typeof v.resolved === 'boolean'
    );
  }

  private async _persist(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this._filePath), { recursive: true });
      await fs.writeFile(this._filePath, JSON.stringify(this._annotations, null, 2), 'utf-8');
    } catch (err) {
      logger.error('Failed to persist annotations', err);
    }
  }
}
