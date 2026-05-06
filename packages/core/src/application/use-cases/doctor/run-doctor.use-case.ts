/**
 * RunDoctorUseCase
 *
 * Orchestrates the `shep doctor` strategy pipeline. Resolves a list of
 * `IDiagnostic` strategies and an `IDiagnosticRunner`, executes them via
 * the runner (parallel + per-diagnostic timeout, see infrastructure
 * adapter), and returns the aggregated `DoctorReport`.
 *
 * Pure orchestration: NO presentation concerns (no formatting, no exit
 * codes). The CLI layer maps `overallStatus` to an exit code; web layers
 * render the report into a table or summary block.
 */

import { inject, injectable, injectAll } from 'tsyringe';

import { DiagnosticStatus } from '../../../domain/generated/output.js';
import type {
  DoctorReport,
  IDiagnostic,
  IDiagnosticRunner,
} from '../../ports/output/services/diagnostic.interface.js';

export interface DoctorReportSummary {
  ok: number;
  warn: number;
  fail: number;
}

export interface DoctorReportWithSummary extends DoctorReport {
  summary: DoctorReportSummary;
}

@injectable()
export class RunDoctorUseCase {
  constructor(
    @inject('IDiagnosticRunner')
    private readonly runner: IDiagnosticRunner,
    @injectAll('IDiagnostic')
    private readonly diagnostics: readonly IDiagnostic[]
  ) {}

  async execute(): Promise<DoctorReportWithSummary> {
    const report = await this.runner.runAll(this.diagnostics);
    return { ...report, summary: countByStatus(report) };
  }
}

function countByStatus(report: DoctorReport): DoctorReportSummary {
  const summary: DoctorReportSummary = { ok: 0, warn: 0, fail: 0 };
  for (const r of report.results) {
    if (r.status === DiagnosticStatus.Ok) summary.ok += 1;
    else if (r.status === DiagnosticStatus.Warn) summary.warn += 1;
    else if (r.status === DiagnosticStatus.Fail) summary.fail += 1;
  }
  return summary;
}
