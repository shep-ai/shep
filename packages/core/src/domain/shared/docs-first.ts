/**
 * Docs first (spec 131): a space can require that agents write the
 * user-facing documentation while planning, build to it, and change it with
 * the code. Documentation is whatever sits under the space's documentation
 * path prefixes.
 *
 * Pure: no I/O. Per the domain/ convention, relative imports carry no
 * extension.
 */

import type { SpaceAgentSettings } from '../generated/output';
import { isAbsolutePath } from './absolute-path';
import { normalizePath } from './normalize-path';

export const DEFAULT_DOCS_PATHS: readonly string[] = ['docs/', 'README.md'];

/** The phases told about docs first. */
export const DOCS_FIRST_PHASES = { plan: 'plan', implement: 'implement' } as const;

const CURRENT_DIR_PREFIX = /^(\.\/)+/;

/** The space's documentation path prefixes. */
export function docsPathsOf(settings: SpaceAgentSettings | undefined): readonly string[] {
  return settings?.docsPaths && settings.docsPaths.length > 0
    ? settings.docsPaths
    : DEFAULT_DOCS_PATHS;
}

/**
 * A repository-relative prefix with forward slashes — a trailing slash marks a
 * directory — or undefined when it is absolute or leaves the repository.
 */
export function normalizeDocsPath(raw: string): string | undefined {
  const trimmed = raw.trim();
  const directory = /[/\\]$/.test(trimmed);
  const path = normalizePath(trimmed).replace(CURRENT_DIR_PREFIX, '').replace(/\/+$/, '');
  if (path === '' || isAbsolutePath(path)) return undefined;
  if (path.split('/').includes('..')) return undefined;
  return directory ? `${path}/` : path;
}

function isUnder(file: string, prefix: string): boolean {
  return prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix;
}

/** The changed files that are documentation, with forward slashes. */
export function documentationChanges(
  changedFiles: readonly string[],
  docsPaths: readonly string[]
): string[] {
  return changedFiles
    .map((file) => normalizePath(file))
    .filter((file) => docsPaths.some((prefix) => isUnder(file, prefix)));
}

/** What a feature-agent phase is told in a docs-first space; empty for other phases. */
export function docsFirstInstructions(phase: string, docsPaths: readonly string[]): string {
  const paths = docsPaths.join(', ');
  if (phase === DOCS_FIRST_PHASES.plan) {
    return [
      '### Docs first',
      `This space develops docs first. Before planning any code, write or update the user-facing documentation for this feature under ${paths}, describing it as if it had shipped: what users can do, how, and any limits.`,
      'List those documentation files in the plan. The documentation is the contract the implementation is built and reviewed against.',
    ].join('\n');
  }
  if (phase === DOCS_FIRST_PHASES.implement) {
    return [
      '### Docs first',
      `The documentation under ${paths} written while planning is the contract: implement exactly what it describes.`,
      'When the implementation has to differ, change the documentation in the same change so the two never disagree. A change without documentation waits for a person before it merges.',
    ].join('\n');
  }
  return '';
}
