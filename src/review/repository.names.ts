import * as path from 'path';

interface NamedRepository {
  readonly label: string;
  readonly root: string;
}

/**
 * Names that tell repositories apart: their labels, or — when two labels are
 * the same, e.g. `~/work/api` and `~/oss/api` — each root relative to the
 * folder the roots share.
 */
export function uniqueRepositoryNames(repositories: readonly NamedRepository[]): string[] {
  const labels = repositories.map(repository => repository.label);
  if (new Set(labels).size === labels.length) return labels;

  const parent = commonParent(repositories.map(repository => repository.root));
  return repositories.map(repository =>
    path.relative(parent, repository.root).replace(/\\/g, '/') || repository.label);
}

function commonParent(paths: readonly string[]): string {
  const split = paths.map(fsPath => path.resolve(fsPath).split(path.sep));
  const first = split[0] ?? [];
  let length = 0;
  while (length < first.length && split.every(parts => parts[length] === first[length])) length++;
  return first.slice(0, length).join(path.sep) || path.sep;
}
