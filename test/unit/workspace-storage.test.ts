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

  it('moves state kept for a subfolder workspace to the repository root, first location winning', async () => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'sieve-storage-'));
    temporaryPaths.push(root);
    const repo = path.join(root, 'repo');
    const subfolder = path.join(repo, 'packages', 'web');
    const sieveHome = path.join(root, 'home', '.sieve');
    const subfolderStorage = workspaceStoragePath(subfolder, sieveHome);
    const repoStorage = workspaceStoragePath(repo, sieveHome);
    await fs.mkdir(path.join(subfolder, '.sieve'), { recursive: true });
    await fs.writeFile(path.join(subfolder, '.sieve', 'triage.json'), '{"from":"repo-local"}');
    await fs.mkdir(subfolderStorage, { recursive: true });
    await fs.writeFile(path.join(subfolderStorage, 'triage.json'), '{"from":"subfolder-storage"}');
    await fs.writeFile(path.join(subfolderStorage, 'annotations.json'), '[{"from":"subfolder-storage"}]');

    await prepareWorkspaceStorage(repo, repoStorage, [path.join(subfolder, '.sieve'), subfolderStorage]);

    expect(JSON.parse(await fs.readFile(path.join(repoStorage, 'triage.json'), 'utf-8'))).toEqual({ from: 'repo-local' });
    expect(JSON.parse(await fs.readFile(path.join(repoStorage, 'annotations.json'), 'utf-8'))).toEqual([{ from: 'subfolder-storage' }]);
    // The losing copy stays where it was rather than being deleted.
    expect(JSON.parse(await fs.readFile(path.join(subfolderStorage, 'triage.json'), 'utf-8'))).toEqual({ from: 'subfolder-storage' });
    expect(JSON.parse(await fs.readFile(path.join(repoStorage, 'workspace.json'), 'utf-8'))).toMatchObject({
      workspacePath: path.resolve(repo),
    });
  });
});
