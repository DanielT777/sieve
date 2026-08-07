import * as fs from 'fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareWorkspaceStorage, workspaceStoragePath } from '../../src/shared/workspace-storage';

const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map(target => fs.rm(target, { recursive: true, force: true })));
});

describe('workspace storage', () => {
  it('migrates legacy state once and records the workspace outside the repo', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'sieve-storage-'));
    temporaryPaths.push(root);
    const workspace = path.join(root, 'repo');
    const sieveHome = path.join(root, 'home', '.sieve');
    const storage = workspaceStoragePath(workspace, sieveHome);
    await fs.mkdir(path.join(workspace, '.sieve'), { recursive: true });
    await fs.writeFile(path.join(workspace, '.sieve', 'annotations.json'), '[{"legacy":true}]');

    await prepareWorkspaceStorage(workspace, storage);
    expect(JSON.parse(await fs.readFile(path.join(storage, 'annotations.json'), 'utf-8'))).toEqual([{ legacy: true }]);
    expect(JSON.parse(await fs.readFile(path.join(storage, 'workspace.json'), 'utf-8'))).toEqual({
      version: 1,
      workspacePath: path.resolve(workspace),
    });
    await expect(fs.stat(path.join(workspace, '.sieve', 'annotations.json'))).rejects.toMatchObject({ code: 'ENOENT' });

    await fs.writeFile(path.join(workspace, '.sieve', 'annotations.json'), '[{"legacy":false}]');
    await prepareWorkspaceStorage(workspace, storage);
    expect(JSON.parse(await fs.readFile(path.join(storage, 'annotations.json'), 'utf-8'))).toEqual([{ legacy: true }]);
  });
});
