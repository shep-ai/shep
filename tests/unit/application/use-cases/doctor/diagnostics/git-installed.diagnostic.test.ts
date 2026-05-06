import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { GitInstalledDiagnostic } from '@/application/use-cases/doctor/diagnostics/git-installed.diagnostic.js';
import type { RunCommandResult } from '@/application/use-cases/doctor/diagnostics/run-command.js';
import { DiagnosticStatus } from '@/domain/generated/output.js';

function ok(stdout: string): RunCommandResult {
  return { exitCode: 0, stdout, stderr: '', notFound: false };
}

describe('GitInstalledDiagnostic', () => {
  it('returns ok with the parsed git version line', async () => {
    const runner = vi.fn().mockResolvedValue(ok('git version 2.45.0'));
    const result = await new GitInstalledDiagnostic(runner).run();
    expect(result.status).toBe(DiagnosticStatus.Ok);
    expect(result.detail).toContain('git version 2.45.0');
  });

  it('returns fail with fixHint when git is not on PATH', async () => {
    const runner = vi
      .fn()
      .mockResolvedValue({ exitCode: -1, stdout: '', stderr: '', notFound: true });
    const result = await new GitInstalledDiagnostic(runner).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.fixHint).toBeDefined();
  });

  it('returns fail when git exits non-zero', async () => {
    const runner = vi
      .fn()
      .mockResolvedValue({ exitCode: 2, stdout: '', stderr: 'broken', notFound: false });
    const result = await new GitInstalledDiagnostic(runner).run();
    expect(result.status).toBe(DiagnosticStatus.Fail);
    expect(result.detail).toContain('exited with code 2');
  });
});
