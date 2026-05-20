/**
 * DiagnosticRunner
 *
 * Implementation of `IDiagnosticRunner` for `shep doctor`. Runs every
 * diagnostic in parallel via `Promise.allSettled` with a per-diagnostic
 * timeout (default 3 s, NFR-7). Worst-case wall-clock = the slowest single
 * check, not the sum.
 *
 * Failures and timeouts surface as structured `DiagnosticResult`s rather
 * than rejected promises so the report always populates fully.
 */

import { injectable } from 'tsyringe';

import { DiagnosticStatus } from '../../../domain/generated/output.js';
import type {
  DiagnosticResult,
  DoctorReport,
  IDiagnostic,
  IDiagnosticRunner,
} from '../../../application/ports/output/services/diagnostic.interface.js';

const DEFAULT_TIMEOUT_MS = 3000;

interface RunnerOptions {
  /** Per-diagnostic timeout in milliseconds. Default: 3000 (NFR-7). */
  timeoutMs?: number;
}

function rankOf(status: DiagnosticStatus): number {
  switch (status) {
    case DiagnosticStatus.Fail:
      return 2;
    case DiagnosticStatus.Warn:
      return 1;
    case DiagnosticStatus.Ok:
    default:
      return 0;
  }
}

function worst(a: DiagnosticStatus, b: DiagnosticStatus): DiagnosticStatus {
  return rankOf(a) >= rankOf(b) ? a : b;
}

function timeoutResult(name: string, timeoutMs: number, durationMs: number): DiagnosticResult {
  return {
    name,
    status: DiagnosticStatus.Warn,
    detail: `Diagnostic "${name}" exceeded ${timeoutMs}ms timeout — marked warn so it does not block doctor`,
    durationMs,
  };
}

function errorResult(name: string, err: unknown, durationMs: number): DiagnosticResult {
  const message = err instanceof Error ? err.message : String(err);
  return {
    name,
    status: DiagnosticStatus.Fail,
    detail: `Diagnostic "${name}" threw: ${message}`,
    durationMs,
  };
}

@injectable()
export class DiagnosticRunner implements IDiagnosticRunner {
  private readonly timeoutMs: number;

  constructor(options: RunnerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async runAll(diagnostics: readonly IDiagnostic[]): Promise<DoctorReport> {
    const overallStart = Date.now();
    if (diagnostics.length === 0) {
      return { results: [], overallStatus: DiagnosticStatus.Ok, totalDurationMs: 0 };
    }

    const settled = await Promise.allSettled(diagnostics.map((d) => this.runOne(d)));

    const results: DiagnosticResult[] = settled.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return errorResult(diagnostics[i]!.name, r.reason, 0);
    });

    const overallStatus = results.reduce<DiagnosticStatus>(
      (acc, r) => worst(acc, r.status),
      DiagnosticStatus.Ok
    );

    return {
      results,
      overallStatus,
      totalDurationMs: Date.now() - overallStart,
    };
  }

  private async runOne(d: IDiagnostic): Promise<DiagnosticResult> {
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<DiagnosticResult>((resolve) => {
      timer = setTimeout(
        () => resolve(timeoutResult(d.name, this.timeoutMs, Date.now() - start)),
        this.timeoutMs
      );
    });

    try {
      const result = await Promise.race([d.run(), timeout]);
      if (timer) clearTimeout(timer);
      return { ...result, durationMs: result.durationMs ?? Date.now() - start };
    } catch (err) {
      if (timer) clearTimeout(timer);
      return errorResult(d.name, err, Date.now() - start);
    }
  }
}
