// @vitest-environment node

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createDoctorCommand } from '../../../../../src/presentation/cli/commands/doctor.command.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';
import type { DoctorReportWithSummary } from '@/application/use-cases/doctor/run-doctor.use-case.js';

function makeReport(overrides: Partial<DoctorReportWithSummary> = {}): DoctorReportWithSummary {
  return {
    results: [
      { name: 'node-version', status: DiagnosticStatus.Ok, detail: 'Node v22.5.1' },
      { name: 'git-installed', status: DiagnosticStatus.Ok, detail: 'git version 2.45.0' },
    ],
    overallStatus: DiagnosticStatus.Ok,
    totalDurationMs: 8,
    summary: { ok: 2, warn: 0, fail: 0 },
    ...overrides,
  };
}

describe('createDoctorCommand', () => {
  let originalExitCode: typeof process.exitCode;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    process.exitCode = 0;
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
  });

  it('exits 0 when all diagnostics are ok', async () => {
    const lines: string[] = [];
    const cmd = createDoctorCommand({
      resolveUseCase: () => ({ execute: async () => makeReport() }),
      out: (line) => lines.push(line),
    });

    await cmd.parseAsync(['node', 'shep']);

    expect(process.exitCode).toBe(0);
    expect(lines.join('\n')).toContain('node-version');
    expect(lines.join('\n')).toContain('Summary:');
  });

  it('exits 0 when warns are present but no fails', async () => {
    const cmd = createDoctorCommand({
      resolveUseCase: () => ({
        execute: async () =>
          makeReport({
            results: [
              { name: 'dotenv-presence', status: DiagnosticStatus.Warn, detail: '.env missing' },
            ],
            overallStatus: DiagnosticStatus.Warn,
            summary: { ok: 0, warn: 1, fail: 0 },
          }),
      }),
      out: () => undefined,
    });

    await cmd.parseAsync(['node', 'shep']);

    expect(process.exitCode).toBe(0);
  });

  it('exits non-zero when at least one diagnostic fails', async () => {
    const lines: string[] = [];
    const cmd = createDoctorCommand({
      resolveUseCase: () => ({
        execute: async () =>
          makeReport({
            results: [
              {
                name: 'pnpm-installed',
                status: DiagnosticStatus.Fail,
                detail: 'pnpm not on PATH',
                fixHint: 'Install pnpm via corepack',
              },
            ],
            overallStatus: DiagnosticStatus.Fail,
            summary: { ok: 0, warn: 0, fail: 1 },
          }),
      }),
      out: (line) => lines.push(line),
    });

    await cmd.parseAsync(['node', 'shep']);

    expect(process.exitCode).toBe(1);
    const output = lines.join('\n');
    expect(output).toContain('pnpm-installed');
    expect(output).toContain('pnpm not on PATH');
    expect(output).toContain('Install pnpm via corepack');
  });

  it('exits non-zero and surfaces the error when the use case throws', async () => {
    const cmd = createDoctorCommand({
      resolveUseCase: () => ({
        execute: async () => {
          throw new Error('container exploded');
        },
      }),
      out: () => undefined,
    });

    await cmd.parseAsync(['node', 'shep']);

    expect(process.exitCode).toBe(1);
  });
});
