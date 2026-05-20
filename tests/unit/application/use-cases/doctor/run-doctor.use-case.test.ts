import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { RunDoctorUseCase } from '@/application/use-cases/doctor/run-doctor.use-case.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';
import type {
  DiagnosticResult,
  DoctorReport,
  IDiagnostic,
  IDiagnosticRunner,
} from '@/application/ports/output/services/diagnostic.interface.js';

function fakeDiagnostic(name: string, status: DiagnosticStatus): IDiagnostic {
  return {
    name,
    run: async (): Promise<DiagnosticResult> => ({ name, status, detail: `${name}-detail` }),
  };
}

function fakeRunner(report: DoctorReport): IDiagnosticRunner {
  return { runAll: vi.fn().mockResolvedValue(report) };
}

describe('RunDoctorUseCase', () => {
  it('aggregates ok/warn/fail counts from the runner output', async () => {
    const diagnostics = [
      fakeDiagnostic('a', DiagnosticStatus.Ok),
      fakeDiagnostic('b', DiagnosticStatus.Warn),
      fakeDiagnostic('c', DiagnosticStatus.Fail),
      fakeDiagnostic('d', DiagnosticStatus.Ok),
    ];
    const report: DoctorReport = {
      results: diagnostics.map((d, i) => ({
        name: d.name,
        status:
          i === 0 || i === 3
            ? DiagnosticStatus.Ok
            : i === 1
              ? DiagnosticStatus.Warn
              : DiagnosticStatus.Fail,
        detail: 'x',
      })),
      overallStatus: DiagnosticStatus.Fail,
      totalDurationMs: 12,
    };
    const runner = fakeRunner(report);
    const useCase = new RunDoctorUseCase(runner, diagnostics);

    const result = await useCase.execute();

    expect(runner.runAll).toHaveBeenCalledWith(diagnostics);
    expect(result.summary).toEqual({ ok: 2, warn: 1, fail: 1 });
    expect(result.overallStatus).toBe(DiagnosticStatus.Fail);
    expect(result.results).toHaveLength(4);
  });

  it('returns zero counts when the diagnostic list is empty', async () => {
    const report: DoctorReport = {
      results: [],
      overallStatus: DiagnosticStatus.Ok,
      totalDurationMs: 0,
    };
    const useCase = new RunDoctorUseCase(fakeRunner(report), []);
    const result = await useCase.execute();
    expect(result.summary).toEqual({ ok: 0, warn: 0, fail: 0 });
  });

  it('does not perform any presentation formatting', async () => {
    const report: DoctorReport = {
      results: [{ name: 'a', status: DiagnosticStatus.Ok, detail: 'fine' }],
      overallStatus: DiagnosticStatus.Ok,
      totalDurationMs: 1,
    };
    const useCase = new RunDoctorUseCase(fakeRunner(report), [
      fakeDiagnostic('a', DiagnosticStatus.Ok),
    ]);
    const result = await useCase.execute();
    expect(result).toMatchObject({
      results: report.results,
      overallStatus: DiagnosticStatus.Ok,
    });
    expect(typeof result).toBe('object');
  });
});
