// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

// execFile reports a spawn failure with an errno `code` string and a non-zero exit with a number.
type ExecFileError = Error & { code?: string | number };
type ExecFileCallback = (error: ExecFileError | null, stdout: string) => void;
type ExecFileImpl = (command: string, args: string[], opts: object, cb: ExecFileCallback) => void;

const mockExecFile = vi.fn<ExecFileImpl>();
vi.mock('node:child_process', () => ({
  execFile: (...args: Parameters<ExecFileImpl>) => mockExecFile(...args),
}));

vi.mock('@/lib/server-container', () => ({
  resolve: () => ({ execute: async () => [] }),
}));

vi.mock('@shepai/core/infrastructure/platform', () => ({ IS_WINDOWS: false }));

const { checkToolStatus } = await import('@/app/actions/check-tool-status.js');

function failWith(code: string | number | undefined, message = 'Command failed'): ExecFileImpl {
  return (_command, _args, _opts, cb) => cb(Object.assign(new Error(message), { code }), '');
}

describe('checkToolStatus', () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  it('reports the parsed version when gh --version succeeds', async () => {
    mockExecFile.mockImplementation((_command, _args, _opts, cb) =>
      cb(null, 'gh version 2.96.0 (2026-01-01)\n')
    );

    const result = await checkToolStatus();

    expect(result.gh).toMatchObject({ installed: true, version: '2.96.0' });
  });

  it('reports not installed when the binary is missing from PATH (ENOENT)', async () => {
    mockExecFile.mockImplementation(failWith('ENOENT', 'spawn gh ENOENT'));

    const result = await checkToolStatus();

    expect(result.gh).toMatchObject({ installed: false, version: null });
    expect(result.git).toMatchObject({ installed: false, version: null });
  });

  it('reports installed with an unknown version when gh exists but cannot read its config (EACCES)', async () => {
    mockExecFile.mockImplementation(failWith('EACCES'));

    const result = await checkToolStatus();

    expect(result.gh).toMatchObject({ installed: true, version: null });
  });

  it('reports installed with an unknown version when gh exits non-zero', async () => {
    mockExecFile.mockImplementation(failWith(1));

    const result = await checkToolStatus();

    expect(result.gh).toMatchObject({ installed: true, version: null });
  });

  it('reports installed with an unknown version when gh --version times out', async () => {
    mockExecFile.mockImplementation(failWith(undefined, 'Command timed out'));

    const result = await checkToolStatus();

    expect(result.gh).toMatchObject({ installed: true, version: null });
  });
});
