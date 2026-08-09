/**
 * Reader for a repository's committed `.shep/dev.json`.
 *
 * Run plans are keyed by on-disk path and shep creates a fresh worktree per
 * feature, so a database-only override evaporates exactly when the user starts
 * their next piece of work. A committed file is durable across worktrees and
 * shared with the team, which is why it is the highest-precedence tier.
 *
 * It is also UNTRUSTED input: it arrives via `git pull` from anyone with
 * commit access. So it is treated exactly like agent output — validated field
 * by field, `cwd` confined to the repository subtree, and never fatal. Any
 * doubt returns `null` ("nothing declared here") with one logged warning and
 * the caller falls through to the next tier (NFR-4).
 *
 * Shape and failure behaviour follow `aspm/ownership-yaml-reader.ts`, which
 * already reads `<repo>/.shep/ownership.yaml` under the same contract.
 *
 * ```json
 * {
 *   "command": "make dev",
 *   "cwd": "services/api",
 *   "expectedPort": 8080,
 *   "language": "Go",
 *   "framework": "Echo",
 *   "packageManager": null,
 *   "setupCommands": ["go mod download"]
 * }
 * ```
 *
 * Only `command` is required. Unknown keys are ignored so the format can grow.
 */

import { existsSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { isPathInside, toComparablePath } from '@/domain/shared/path-confinement.js';
import { isValidPort } from '@/domain/shared/port-range.js';
import { createDeploymentLogger } from './deployment-logger.js';
import { readJsonManifest } from './detectors/shared/json-manifest.js';

/** Repository-relative location of the committed dev config. */
export const REPO_DEV_CONFIG_PATH = '.shep/dev.json';

/** A validated `.shep/dev.json` document. */
export interface RepoDevConfig {
  /** Verbatim command to spawn. Non-empty after trimming. */
  command: string;
  /** Absolute working directory, guaranteed inside the repository subtree. */
  cwd: string;
  expectedPort?: number;
  language?: string;
  framework?: string;
  packageManager?: string;
  setupCommands: string[];
}

const log = createDeploymentLogger('[repoDevConfig]');

/**
 * Read and validate `<repoPath>/.shep/dev.json`.
 *
 * @param repoPath - Absolute path to the repository root.
 * @returns The validated config, or `null` when the file is absent, invalid,
 *          or declares a `cwd` outside the repository.
 */
export function readRepoDevConfig(repoPath: string): RepoDevConfig | null {
  const filePath = resolve(repoPath, ...REPO_DEV_CONFIG_PATH.split('/'));
  if (!existsSync(filePath)) return null;

  const document = readJsonManifest(filePath);
  if (document === null) {
    log.warn(`${filePath} is not a JSON object — ignoring it`);
    return null;
  }

  const command = nonEmptyString(document.command);
  if (command === undefined) {
    log.warn(`${filePath} declares no non-empty "command" — ignoring it`);
    return null;
  }

  const cwd = resolveConfinedCwd(repoPath, document.cwd, filePath);
  if (cwd === null) return null;

  return {
    command,
    cwd,
    setupCommands: stringList(document.setupCommands),
    ...optional('expectedPort', port(document.expectedPort, filePath)),
    ...optional('language', nonEmptyString(document.language)),
    ...optional('framework', nonEmptyString(document.framework)),
    ...optional('packageManager', nonEmptyString(document.packageManager)),
  };
}

/** Spread helper that omits a key entirely when its value is absent. */
function optional<K extends string, V>(key: K, value: V | undefined): Record<K, V> | object {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

/** A string with content, or `undefined` for every other value. */
function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Non-empty strings from an array, dropping every other entry. */
function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const items: string[] = [];
  for (const entry of value) {
    const item = nonEmptyString(entry);
    if (item !== undefined) items.push(item);
  }
  return items;
}

/**
 * An integer port in range.
 *
 * An out-of-range or non-integer value is DROPPED rather than coerced, and
 * the rest of the document still applies — a bad port must not cost the user
 * their command, and a coerced one would drive the verify node's TCP probe at
 * a socket nothing is listening on.
 */
function port(value: unknown, filePath: string): number | undefined {
  if (value === undefined || value === null) return undefined;

  if (!isValidPort(value)) {
    log.warn(`${filePath} declares an invalid "expectedPort" — ignoring that field`);
    return undefined;
  }

  return value;
}

/**
 * Resolve `cwd` against the repository root and confine it to that subtree.
 *
 * Confinement compares canonical paths, so a symlink pointing outside the
 * repository is caught. The comparison itself is `isPathInside` — shared with
 * `OverrideDevServerRunPlanUseCase`, because a committed file and a typed
 * override must be confined by the same rule (NFR-6).
 *
 * @returns The absolute cwd, or `null` when it escapes, is missing, or is not
 *          a directory — all of which fall the whole document through.
 */
function resolveConfinedCwd(repoPath: string, value: unknown, filePath: string): string | null {
  const declared = nonEmptyString(value);
  const absolute = declared === undefined ? repoPath : resolveDeclared(repoPath, declared);

  if (!isExistingDirectory(absolute)) {
    log.warn(`${filePath} declares a "cwd" that is not an existing directory — ignoring it`);
    return null;
  }

  if (!isPathInside(canonical(repoPath), canonical(absolute))) {
    log.warn(`${filePath} declares a "cwd" outside the repository — ignoring it`);
    return null;
  }

  return absolute;
}

/** Resolve a declared cwd, which may be repo-relative or absolute. */
function resolveDeclared(repoPath: string, declared: string): string {
  return isAbsolute(declared) ? resolve(declared) : resolve(repoPath, declared);
}

/** Canonical, comparable form of a path (symlinks resolved where possible). */
function canonical(path: string): string {
  let real = path;
  try {
    real = realpathSync(path);
  } catch {
    // Not resolvable — compare the lexical form rather than giving up.
  }

  return toComparablePath(resolve(real));
}

/** Existence check that degrades to false rather than throwing. */
function isExistingDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
