import * as fs from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { startReviewRound } from '../../src/review/checkpoint.round';
import { TriageManager } from '../../src/review/triage.manager';
import { AnnotationStore } from '../../src/annotations/annotation.store';
import type { ReviewRepository } from '../../src/review/review.repository';
import type { Annotation } from '../../src/review/annotation';

describe('startReviewRound', () => {
  it('resets the round triage and moves its comments to the working tree', async () => {
    const storage = fs.mkdtempSync(path.join(tmpdir(), 'sieve-round-'));
    const triage = new TriageManager();
    const annotations = new AnnotationStore(storage);
    const setCheckpoint = vi.fn();
    const repository = { diff: { setCheckpoint }, triage, annotations } as unknown as ReviewRepository;

    triage.setState('checkpoint\0/repo/a.ts', 'reviewed');
    triage.setState('/repo/a.ts', 'flagged');
    await annotations.add(annotation('round-2', 'checkpoint'));
    await annotations.add(annotation('branch', 'compare:main...feature'));

    const checkpoint = { tree: 'a'.repeat(40), createdAt: 1 };
    await startReviewRound(repository, checkpoint);

    expect(setCheckpoint).toHaveBeenCalledWith(checkpoint);
    expect(triage.toJSON()).toEqual({ '/repo/a.ts': 'flagged' });
    expect(annotations.getAll().map(a => [a.id, a.sourceId])).toEqual([
      ['round-2', undefined],
      ['branch', 'compare:main...feature'],
    ]);
    // Persisted, so the agent skill reads the same thing.
    expect(JSON.parse(fs.readFileSync(path.join(storage, 'annotations.json'), 'utf-8'))[0].sourceId).toBeUndefined();
    fs.rmSync(storage, { recursive: true, force: true });
  });
});

function annotation(id: string, sourceId: string): Annotation {
  return { id, fileUri: '/repo/a.ts', sourceId, startLine: 1, endLine: 1, body: id, createdAt: 0, resolved: false };
}
