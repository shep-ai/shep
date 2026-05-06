/**
 * DiagnosticRunner — unit tests
 *
 * Verifies parallel execution, per-diagnostic 3 s timeout, status
 * aggregation, and that throwing/timing-out diagnostics surface as
 * structured DiagnosticResults rather than rejecting the run.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { DiagnosticRunner } from '@/infrastructure/services/doctor/diagnostic-runner.service.js';
import type {
  IDiagnostic,
  DiagnosticResult,
} from '@/application/ports/output/services/diagnostic.interface.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';

function fast(name: string, status: DiagnosticStatus, detail = 'ok'): IDiagnostic {
  return {
    name,
    run: () => Promise.resolve({ name, status, detail }),
  };
}

function slow(name: string, durationMs: number): IDiagnostic {
  return {
    name,
    run: () =>
      new Promise<DiagnosticResult>((resolve) => {
        setTimeout(
          () => resolve({ name, status: DiagnosticStatus.Ok, detail: 'finally' }),
          durationMs
        );
      }),
  };
}

function broken(name: string, error: Error): IDiagnostic {
  return { name, run: () => Promise.reject(error) };
}

describe('DiagnosticRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs every diagnostic and reports each result', async () => {
    const runner = new DiagnosticRunner();
    const promise = runner.runAll([
      fast('a', DiagnosticStatus.Ok, 'a-ok'),
      fast('b', DiagnosticStatus.Warn, 'b-warn'),
    ]);
    await vi.runAllTimersAsync();
    const report = await promise;

    expect(report.results).toHaveLength(2);
    expect(report.results.map((r) => r.name).sort()).toEqual(['a', 'b']);
    expect(report.overallStatus).toBe(DiagnosticStatus.Warn);
  });

  it('marks a diagnostic that exceeds the 3 s timeout as Warn (non-blocking)', async () => {
    const runner = new DiagnosticRunner({ timeoutMs: 3000 });
    const promise = runner.runAll([slow('slow', 5000)]);
    await vi.advanceTimersByTimeAsync(3500);
    const report = await promise;

    expect(report.results).toHaveLength(1);
    expect(report.results[0]!.status).toBe(DiagnosticStatus.Warn);
    expect(report.results[0]!.detail).toMatch(/timeout|exceeded/i);
  });

  it('captures a thrown error from a diagnostic as Fail with the message in detail', async () => {
    const runner = new DiagnosticRunner();
    const promise = runner.runAll([broken('explode', new Error('boom'))]);
    await vi.runAllTimersAsync();
    const report = await promise;

    expect(report.results[0]!.status).toBe(DiagnosticStatus.Fail);
    expect(report.results[0]!.detail).toContain('boom');
    expect(report.overallStatus).toBe(DiagnosticStatus.Fail);
  });

  it('propagates the worst status: any fail trumps warn trumps ok', async () => {
    const runner = new DiagnosticRunner();
    const promise = runner.runAll([
      fast('ok', DiagnosticStatus.Ok),
      fast('warn', DiagnosticStatus.Warn),
      fast('fail', DiagnosticStatus.Fail),
    ]);
    await vi.runAllTimersAsync();
    const report = await promise;
    expect(report.overallStatus).toBe(DiagnosticStatus.Fail);
  });

  it('records a durationMs for each diagnostic', async () => {
    const runner = new DiagnosticRunner();
    const promise = runner.runAll([fast('a', DiagnosticStatus.Ok)]);
    await vi.runAllTimersAsync();
    const report = await promise;
    expect(report.results[0]!.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns an empty report when no diagnostics are provided', async () => {
    const runner = new DiagnosticRunner();
    const report = await runner.runAll([]);
    expect(report.results).toEqual([]);
    expect(report.overallStatus).toBe(DiagnosticStatus.Ok);
  });
});
