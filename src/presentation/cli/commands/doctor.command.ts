/**
 * Doctor Command
 *
 * `shep doctor` — diagnose the contributor environment. Runs every
 * registered `IDiagnostic` strategy via the `RunDoctorUseCase`, prints a
 * structured table (status / name / detail / fix-hint), and exits with a
 * non-zero code when any diagnostic is `fail`.
 *
 * Presentation only: no business logic. The use case owns aggregation;
 * this command owns formatting + exit-code mapping.
 */

import { Command } from 'commander';

import { container } from '@/infrastructure/di/container.js';
import { RunDoctorUseCase } from '@/application/use-cases/doctor/run-doctor.use-case.js';
import type { DoctorReportWithSummary } from '@/application/use-cases/doctor/run-doctor.use-case.js';
import type { DiagnosticResult } from '@/application/ports/output/services/diagnostic.interface.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';
import { colors, symbols, messages, fmt } from '../ui/index.js';

interface DoctorOptions {
  /** Resolver override — exposed for testing. */
  resolveUseCase?: () => Pick<RunDoctorUseCase, 'execute'>;
  /** Output sink override — exposed for testing; defaults to console.log. */
  out?: (line: string) => void;
}

const STATUS_WIDTH = 6;
const NAME_WIDTH = 24;

export function createDoctorCommand(options: DoctorOptions = {}): Command {
  return new Command('doctor')
    .description('Diagnose the local Shep contributor environment')
    .addHelpText(
      'after',
      `
Examples:
  $ shep doctor                         Check local contributor setup
  $ SHEP_HOME=/tmp/shep-home shep doctor Check an isolated Shep home
  $ shep doctor && pnpm test            Run tests only when diagnostics pass`
    )
    .action(async () => {
      try {
        const useCase = options.resolveUseCase
          ? options.resolveUseCase()
          : container.resolve(RunDoctorUseCase);
        const report = await useCase.execute();
        renderReport(report, options.out ?? ((line) => console.log(line)));
        process.exitCode = report.summary.fail > 0 ? 1 : 0;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        messages.error('shep doctor failed', error);
        process.exitCode = 1;
      }
    });
}

function renderReport(report: DoctorReportWithSummary, out: (line: string) => void): void {
  out('');
  out(`  ${fmt.heading('shep doctor')}`);
  out('');

  // Header row
  out(
    `  ${colors.muted('STATUS'.padEnd(STATUS_WIDTH))}  ${colors.muted('NAME'.padEnd(NAME_WIDTH))}  ${colors.muted('DETAIL')}`
  );
  for (const result of report.results) {
    out(formatRow(result));
    if (result.fixHint) {
      out(
        `  ${' '.repeat(STATUS_WIDTH)}  ${' '.repeat(NAME_WIDTH)}  ${colors.muted(`↳ ${result.fixHint}`)}`
      );
    }
  }

  out('');
  out(formatSummaryLine(report));
  out('');
}

function formatRow(result: DiagnosticResult): string {
  const statusCell = formatStatusBadge(result.status);
  const nameCell = result.name.padEnd(NAME_WIDTH);
  return `  ${statusCell}  ${nameCell}  ${result.detail}`;
}

function formatStatusBadge(status: DiagnosticStatus): string {
  switch (status) {
    case DiagnosticStatus.Ok:
      return colors.success(`${symbols.success} ok  `.padEnd(STATUS_WIDTH));
    case DiagnosticStatus.Warn:
      return colors.warning(`${symbols.warning} warn`.padEnd(STATUS_WIDTH));
    case DiagnosticStatus.Fail:
      return colors.error(`${symbols.error} fail`.padEnd(STATUS_WIDTH));
    default:
      return colors.muted(String(status).padEnd(STATUS_WIDTH));
  }
}

function formatSummaryLine(report: DoctorReportWithSummary): string {
  const { ok, warn, fail } = report.summary;
  const parts = [
    colors.success(`${ok} ok`),
    colors.warning(`${warn} warn`),
    colors.error(`${fail} fail`),
  ];
  return `  ${colors.muted('Summary:')} ${parts.join('  ')}  ${colors.muted(`(${report.totalDurationMs}ms)`)}`;
}
