/**
 * Detector registry — precedence, shared limits and ecosystem names.
 *
 * This module is the ONE place detector precedence is expressed, mirroring
 * how the rest of the deployment services express priority (SCRIPT_PRIORITY,
 * LOCKFILE_MANAGERS, CONFIG_FILES, LOCKFILES are all module-level ordered
 * `const` arrays). Adding a ninth ecosystem must mean one new detector module
 * plus one entry here — nothing else (NFR-3).
 *
 * ## Precedence
 *
 * `.shep/dev.json` → Node/Deno → Make → language toolchain → Docker Compose,
 * evaluated first-success-wins. Node stays first so every repository shep
 * runs today resolves to the byte-identical command it resolves to now;
 * Compose is last because `docker compose up` is the slowest and most
 * side-effectful option and should only win when nothing else does.
 *
 * ## Bounded work
 *
 * Detection must complete in under 200 ms with no network, no child process
 * and no LLM call (NFR-1). The caps here are what keep the one-level
 * subdirectory fallback from turning detection into a filesystem sweep on a
 * wide repository, and keep a generated lockfile from being read whole.
 */

/**
 * The ecosystems the registry covers, in precedence order.
 *
 * Values are stable identifiers used in the deployment log line that names
 * the winning tier (NFR-11), so they are lowercase and hyphenated rather
 * than display strings.
 */
export const Ecosystem = {
  /** A committed `.shep/dev.json` — the highest-precedence tier. */
  RepoConfig: 'repo-config',
  Node: 'node',
  Deno: 'deno',
  Make: 'make',
  Python: 'python',
  Go: 'go',
  Rust: 'rust',
  Ruby: 'ruby',
  Elixir: 'elixir',
  Compose: 'compose',
} as const;

export type Ecosystem = (typeof Ecosystem)[keyof typeof Ecosystem];

/**
 * Non-project directory names skipped by the one-level subdirectory scan.
 *
 * Shared by every ecosystem, not just Node — a Go or Python project nested
 * under `apps/` must be found by the same walk that finds a Node one (FR-7).
 */
export const SKIP_DIRS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'out',
  '.cache',
]);

/**
 * True when a directory entry must not be descended into.
 *
 * Covers the named directories above PLUS every dot-directory — `.venv`,
 * `.tox`, `.shep` and friends are all tool state, never the project.
 */
export function isSkippedDir(name: string): boolean {
  return name.startsWith('.') || SKIP_DIRS.has(name);
}

/**
 * Upper bound on a single manifest read (256 KB).
 *
 * Generated `Gemfile.lock` / `docker-compose.yml` files can be large; nothing
 * a detector looks for lives past this point, so reading further is pure cost.
 */
export const MAX_MANIFEST_BYTES = 256 * 1024;

/**
 * Upper bound on the immediate subdirectories the fallback scan visits.
 *
 * A repository whose root holds hundreds of directories must not multiply the
 * whole registry by that count. When this cap truncates the scan, the caller
 * logs it — a silently dropped directory reads as "we looked everywhere" when
 * we did not.
 */
export const MAX_SCANNED_SUBDIRS = 50;
