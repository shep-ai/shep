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

/**
 * Config/manifest files considered when computing the config hash.
 *
 * This list and the detector registry must stay in agreement: a stack the
 * registry can detect but this list does not fingerprint would never
 * re-analyze when its manifest changed, and a manifest fingerprinted here
 * that nothing can detect just burns an agent call on every edit.
 *
 * `.shep/dev.json` is tracked for the DELETE direction. The committed
 * override is re-read on every start, so it can never go stale itself —
 * but removing it must invalidate the deterministic plan that replaces it.
 */
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
  // All three GNU Make spellings — which one exists depends on the author,
  // and on a case-insensitive filesystem two of them resolve to one file
  // (see the de-duplication in computeConfigHash).
  'Makefile',
  'makefile',
  'GNUmakefile',
  'Cargo.toml',
  'Cargo.lock',
  'go.mod',
  'go.work',
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
  'mix.lock',
  'deno.json',
  'deno.jsonc',
  'deno.lock',
  '.shep/dev.json',
];

/**
 * Deterministic sha256 over the sorted (by filename), currently-existing
 * subset of CONFIG_FILES: concatenation of `<filename>\0<file bytes>\0` in
 * ascending filename order. Missing files are skipped. A directory with
 * none of these files present hashes to the sha256 of empty input.
 *
 * Entries that differ only by case (the Makefile spellings) contribute at
 * most once: on macOS and Windows all of them `existsSync`-hit the same file,
 * and hashing its bytes two or three times would make the digest depend on
 * the filesystem's case sensitivity rather than on the repository.
 */
export function computeConfigHash(dir: string): string {
  const hash = createHash('sha256');
  const sortedFiles = [...CONFIG_FILES].sort();
  const hashed = new Set<string>();

  for (const filename of sortedFiles) {
    const caseKey = filename.toLowerCase();
    if (hashed.has(caseKey)) continue;

    const filePath = join(dir, filename);
    if (!existsSync(filePath)) continue;

    hashed.add(caseKey);
    hash.update(filename);
    hash.update('\0');
    hash.update(readFileSync(filePath));
    hash.update('\0');
  }

  return hash.digest('hex');
}

/**
 * Files considered for install staleness, in priority order.
 *
 * The five Node lockfiles MUST stay first, in this exact order: that is what
 * keeps `computeInstallHash` byte-identical for every repository shep runs
 * today. The per-ecosystem entries that follow exist because the function
 * previously returned '' for any repo without a Node lockfile or
 * package.json — and an empty hash is never fresh, so a Go/Rust/Python/Elixir
 * plan would re-run its full setupCommands list on every single start.
 *
 * `requirements.txt` is not strictly a lockfile, but it is the strongest
 * install signal that ecosystem has, and hashing it beats hashing nothing.
 */
export const LOCKFILES: readonly string[] = [
  // Node — order is a compatibility requirement, not a preference.
  'bun.lock',
  'bun.lockb',
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
  // Python
  'uv.lock',
  'poetry.lock',
  'Pipfile.lock',
  'requirements.txt',
  // Rust / Go / Ruby / Elixir / Deno
  'Cargo.lock',
  'go.sum',
  'Gemfile.lock',
  'mix.lock',
  'deno.lock',
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
