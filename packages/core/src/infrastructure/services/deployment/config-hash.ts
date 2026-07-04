/**
 * Config hashing for install-cache invalidation.
 *
 * `computeConfigHash` fingerprints a repo directory's dependency-manifest
 * inventory (package.json, lockfiles, and other language-ecosystem config
 * files) so the dev-server graph can tell whether a previously analyzed
 * run plan is still valid, without re-running detection or the agent.
 *
 * `computeInstallHash` fingerprints just the strongest install-staleness
 * signal (the lockfile, or package.json when no lockfile exists) so the
 * graph can decide whether `node_modules` needs a fresh `install`.
 *
 * Both functions are synchronous and side-effect free (read-only fs
 * access) — deliberately simple given the small size of the files
 * involved. Hash *stamping* (persisting the computed value onto the
 * run-plan row) is NOT this module's job; that is done by the graph node
 * that calls these functions, via the run-plan repository.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Config/manifest files considered when computing the config hash. */
export const CONFIG_FILES: readonly string[] = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'docker-compose.yml',
  'docker-compose.yaml',
  'Dockerfile',
  'Makefile',
  'Cargo.toml',
  'Cargo.lock',
  'go.mod',
  'go.sum',
  'requirements.txt',
  'Pipfile',
  'Pipfile.lock',
  'pyproject.toml',
  'poetry.lock',
  'uv.lock',
  'setup.py',
  'Gemfile',
  'Gemfile.lock',
  'build.gradle',
  'pom.xml',
  'mix.exs',
  'deno.json',
];

/**
 * Deterministic sha256 over the sorted (by filename), currently-existing
 * subset of CONFIG_FILES: concatenation of `<filename>\0<file bytes>\0` in
 * ascending filename order. Missing files are skipped. A directory with
 * none of these files present hashes to the sha256 of empty input.
 */
export function computeConfigHash(dir: string): string {
  const hash = createHash('sha256');
  const sortedFiles = [...CONFIG_FILES].sort();

  for (const filename of sortedFiles) {
    const filePath = join(dir, filename);
    if (!existsSync(filePath)) continue;

    hash.update(filename);
    hash.update('\0');
    hash.update(readFileSync(filePath));
    hash.update('\0');
  }

  return hash.digest('hex');
}

/** Lockfiles considered for install staleness, in priority order. */
export const LOCKFILES: readonly string[] = [
  'bun.lock',
  'bun.lockb',
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
];

/**
 * sha256 of the first existing lockfile's contents (checked in LOCKFILES
 * priority order). Falls back to hashing package.json when no lockfile is
 * present. Returns '' when neither exists.
 */
export function computeInstallHash(dir: string): string {
  for (const filename of LOCKFILES) {
    const filePath = join(dir, filename);
    if (existsSync(filePath)) {
      return createHash('sha256').update(readFileSync(filePath)).digest('hex');
    }
  }

  const packageJsonPath = join(dir, 'package.json');
  if (existsSync(packageJsonPath)) {
    return createHash('sha256').update(readFileSync(packageJsonPath)).digest('hex');
  }

  return '';
}
