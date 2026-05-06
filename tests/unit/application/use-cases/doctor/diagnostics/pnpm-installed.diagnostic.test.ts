import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { PnpmInstalledDiagnostic } from '@/application/use-cases/doctor/diagnostics/pnpm-installed.diagnostic.js';
import type { RunCommandResult } from '@/application/use-cases/doctor/diagnostics/run-command.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';

function ok(stdout: string): RunCommandResult {
  return { exitCode: 0, stdout, stderr: '', notFound: false };
}
function notFound(): RunCommandResult {
  return { exitCode: -1, stdout: '', stderr: 'spawn ENOENT', notFound: true };
}
function fail(stderr = 'boom'): RunCommandResult {
  return { exitCode: 1, stdout: '', stderr, notFound: false };
}

describe('PnpmInstalledDiagnostic', () => {
  it('returns ok with the parsed pnpm version', async () => {
    const runner = vi.fn().mockResolvedValue(ok('9.6.0'));
    const result = await new PnpmInstalledDiagnostic(runner).run();
    expect(result.status).toBe(DiagnosticStatus.Ok);
    expect(result.detail).toContain('9.6.0');
    expect(runner).toHaveBeenCalledWith('pnpm', ['--version']);
  });

  it('returns fail with fixHint when pnpm is not on PATH', async () => {
    const result = await new PnpmInstalledDiagnostic(vi.fn().mockResolvedValue(notFound())).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.fixHint).toBeDefined();
  });

  it('returns fail when pnpm exits non-zero', async () => {
    const result = await new PnpmInstalledDiagnostic(vi.fn().mockResolvedValue(fail())).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.detail).toContain('exited with code 1');
  });
});
