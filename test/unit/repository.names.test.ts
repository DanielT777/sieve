import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { uniqueRepositoryNames } from '../../src/review/repository.names';

describe('uniqueRepositoryNames', () => {
  it('keeps labels that already tell repositories apart', () => {
    expect(uniqueRepositoryNames([
      { label: 'app', root: path.resolve('/code/app') },
      { label: 'app-hotfix', root: path.resolve('/code/app-hotfix') },
    ])).toEqual(['app', 'app-hotfix']);
  });

  it('falls back to paths below the shared folder when labels collide', () => {
    expect(uniqueRepositoryNames([
      { label: 'api', root: path.resolve('/home/me/work/api') },
      { label: 'api', root: path.resolve('/home/me/oss/api') },
    ])).toEqual(['work/api', 'oss/api']);
  });
});
