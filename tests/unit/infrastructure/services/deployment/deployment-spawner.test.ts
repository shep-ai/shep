// @vitest-environment node

/**
 * spawnFromDetection Unit Tests
 *
 * `deployment.service.start()` calls this for every start that arrives
 * without a run plan, and it used to pass `packageManager` + `scriptName`
 * straight to `spawn` as executable and argv. Those are Node-specific facts,
 * so once the detector can return a Make or Compose result this MUST take the
 * shell branch — otherwise it spawns `undefined`.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, vi } from 'vitest';
import type { ChildProcess } from 'node:child_process';
import { spawnFromDetection } from '@/infrastructure/services/deployment/deployment-spawner.js';
import type { DetectDevScriptResult } from '@/infrastructure/services/deployment/detect-dev-script.js';

const CWD = '/repo';

function makeDeps(detection: DetectDevScriptResult) {
  const spawn = vi.fn().mockReturnValue({ pid: 1234 } as ChildProcess);
  return {
    deps: {
      spawn,
      detectDevScript: vi.fn().mockReturnValue(detection),
    } as unknown as Parameters<typeof spawnFromDetection>[0],
    spawn,
  };
}

describe('spawnFromDetection — Node results keep the argv spawn', () => {
  it('spawns npm with an explicit run prefix', () => {
    const { deps, spawn } = makeDeps({
      success: true,
      packageManager: 'npm',
      scriptName: 'dev',
      command: 'npm run dev',
      needsInstall: false,
      resolvedDir: CWD,
    });

    spawnFromDetection(deps, CWD);

    expect(spawn).toHaveBeenCalledWith(
      'npm',
      ['run', 'dev'],
      expect.objectContaining({ cwd: CWD })
    );
  });

  it('spawns bun with an explicit run prefix', () => {
    const { deps, spawn } = makeDeps({
      success: true,
      packageManager: 'bun',
      scriptName: 'dev',
      command: 'bun run dev',
      needsInstall: false,
      resolvedDir: CWD,
    });

    spawnFromDetection(deps, CWD);

    expect(spawn).toHaveBeenCalledWith('bun', ['run', 'dev'], expect.anything());
  });

  it('spawns pnpm with the bare script name', () => {
    const { deps, spawn } = makeDeps({
      success: true,
      packageManager: 'pnpm',
      scriptName: 'dev',
      command: 'pnpm dev',
      needsInstall: false,
      resolvedDir: CWD,
    });

    spawnFromDetection(deps, CWD);

    expect(spawn).toHaveBeenCalledWith('pnpm', ['dev'], expect.anything());
  });
});

describe('spawnFromDetection — non-Node results take the shell branch', () => {
  it('spawns a Make command as a single shell string', () => {
    const { deps, spawn } = makeDeps({
      success: true,
      scriptName: 'dev',
      command: 'make dev',
      needsInstall: false,
      resolvedDir: CWD,
    });

    spawnFromDetection(deps, CWD);

    expect(spawn).toHaveBeenCalledWith(
      'make dev',
      expect.objectContaining({ cwd: CWD, shell: true })
    );
    expect(spawn.mock.calls[0][0]).not.toBeUndefined();
  });

  it('spawns a Compose command whole, dropping no argument', () => {
    const { deps, spawn } = makeDeps({
      success: true,
      command: 'docker compose up',
      needsInstall: false,
      resolvedDir: CWD,
    });

    spawnFromDetection(deps, CWD);

    expect(spawn).toHaveBeenCalledWith('docker compose up', expect.objectContaining({ cwd: CWD }));
  });

  it('spawns a command that has a package manager but no script name', () => {
    const { deps, spawn } = makeDeps({
      success: true,
      packageManager: 'deno',
      command: 'deno task dev',
      needsInstall: false,
      resolvedDir: CWD,
    });

    spawnFromDetection(deps, CWD);

    expect(spawn).toHaveBeenCalledWith('deno task dev', expect.anything());
  });
});

describe('spawnFromDetection — failed detection', () => {
  it('throws the detector error', () => {
    const { deps } = makeDeps({ success: false, error: 'No package.json found in /repo' });

    expect(() => spawnFromDetection(deps, CWD)).toThrow('No package.json found in /repo');
  });
});
