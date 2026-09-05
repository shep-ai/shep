/**
 * Detector contracts.
 *
 * Every ecosystem detector is a pure, synchronous function of a directory
 * path: it either produces a command that will start that directory's dev
 * server, or it falls through so the next detector in the registry gets a
 * turn. Detectors never throw and never depend on one another (NFR-3, NFR-4).
 *
 * ## Why `packageManager` and `scriptName` are optional
 *
 * Both were always Node-specific facts leaking into a general contract:
 * `make dev` has no package manager and `docker compose up` has no
 * package.json script. Widening the detector set makes them genuinely
 * absent for most ecosystems, so they are optional here and every consumer
 * must handle their absence — `command` plus `resolvedDir` is the part that
 * is always present.
 *
 * This module deliberately has NO imports: it is the shared vocabulary that
 * `registry.ts` and every detector build on.
 */

/** A detector that produced a runnable dev-server command. */
export interface DetectorSuccess {
  success: true;

  /**
   * Package manager for installs (npm/pnpm/yarn/bun/deno).
   * Absent for ecosystems that have no package-manager concept.
   */
  packageManager?: string;

  /**
   * Name of the manifest script/task/target that was selected
   * (a package.json script, a deno task, a Makefile target).
   * Absent when the command is not script-driven (e.g. `cargo run`).
   */
  scriptName?: string;

  /** Exact command to spawn the dev server. */
  command: string;

  /** True when the ecosystem's dependencies are not installed yet. */
  needsInstall: boolean;

  /**
   * The directory the detection resolved to. Differs from the input path
   * when the one-level subdirectory scan found the project in a child
   * directory (monorepo / nested layouts).
   */
  resolvedDir: string;

  /** Detected primary language (informational; surfaced on the run plan). */
  language?: string;

  /** Detected framework (informational; surfaced on the run plan). */
  framework?: string;

  /**
   * Port the server is expected to listen on.
   *
   * Set ONLY from an explicit source — an in-command `--port`/`-p` flag, a
   * Compose `ports:` mapping, or a positively-identified framework default.
   * Left unset otherwise: this value drives the verify node's TCP fallback,
   * where a wrong port manufactures a readiness failure on a healthy server
   * while an unset one degrades safely to log parsing.
   */
  expectedPort?: number;

  /** Ordered one-time setup commands to run before the first start. */
  setupCommands?: string[];

  /**
   * Toolchain/runtime binary the command needs (`make`, `docker`, `go`, …).
   * Informational — `ensure_infra` derives what it probes from the command
   * itself, so this never becomes a competing source of truth.
   */
  runtime?: string;
}

/** A detector that could not produce a command. */
export interface DetectorError {
  success: false;
  /** Human-readable reason, surfaced only when the whole chain falls through. */
  error: string;
}

export type DetectorResult = DetectorSuccess | DetectorError;

/** The shape every ecosystem detector module exports. */
export type Detector = (dirPath: string) => DetectorResult;
