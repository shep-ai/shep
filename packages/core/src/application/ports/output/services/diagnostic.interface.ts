/**
 * Diagnostic Port
 *
 * One `IDiagnostic` per `shep doctor` check. Each diagnostic is a strategy
 * object: it knows its name and how to run itself. The `IDiagnosticRunner`
 * fans out an array of diagnostics in parallel with a per-diagnostic 3 s
 * timeout (NFR-7) so the worst-case runtime is the slowest single check,
 * not the sum.
 *
 * Diagnostics live in the application layer alongside the doctor use case
 * (`application/use-cases/doctor/diagnostics/`); each one reuses existing
 * application ports (e.g. `IAgentAuthDetectorService`,
 * `IGitHubRepositoryService`) and never imports from `infrastructure/`.
 */

import type { DiagnosticStatus } from '../../../../domain/generated/output.js';

/**
 * Result of a single diagnostic run.
 */
export interface DiagnosticResult {
  /** Stable diagnostic name (e.g. "node-version", "gh-cli-auth"). */
  name: string;
  /** Terminal status — see `DiagnosticStatus` enum. */
  status: DiagnosticStatus;
  /** Human-readable detail line; safe to print verbatim to the CLI. */
  detail: string;
  /** Optional one-line hint pointing the contributor at a fix. */
  fixHint?: string;
  /** Wall-clock duration in milliseconds — populated by the runner. */
  durationMs?: number;
}

/**
 * Strategy contract for a single doctor check.
 */
export interface IDiagnostic {
  /** Stable identifier — used to look the result up in the runner output. */
  readonly name: string;

  /**
   * Run the check. MUST resolve (never throw) — surface failures via
   * `status: 'fail'`. The runner enforces the 3 s timeout externally.
   */
  run(): Promise<DiagnosticResult>;
}

/**
 * Aggregated output of `IDiagnosticRunner.runAll`.
 */
export interface DoctorReport {
  /** All diagnostic results in declaration order. */
  results: readonly DiagnosticResult[];
  /** Worst-status across all checks: `fail` > `warn` > `ok`. */
  overallStatus: DiagnosticStatus;
  /** Wall-clock duration for the full run in milliseconds. */
  totalDurationMs: number;
}

/**
 * Output port for the parallel diagnostic runner.
 */
export interface IDiagnosticRunner {
  /**
   * Run every diagnostic in parallel with a per-diagnostic timeout.
   * Returns a fully-populated `DoctorReport` even when individual checks
   * fail or time out.
   */
  runAll(diagnostics: readonly IDiagnostic[]): Promise<DoctorReport>;
}
