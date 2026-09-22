/**
 * GetWorkerLogPathUseCase — where a run's worker log lives.
 *
 * The worker writes under the Shep home (which honours SHEP_HOME); the CLI
 * readers used to hard-code `~/.shep`, so with SHEP_HOME set `shep feat logs`
 * and `shep agent logs` looked in the wrong directory (spec 116).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GetWorkerLogPathUseCase } from '@/application/use-cases/logs/get-worker-log-path.use-case.js';
import { LogFileStoreService } from '@/infrastructure/services/logging/log-file-store.service.js';

describe('GetWorkerLogPathUseCase', () => {
  let home: string;
  let originalShepHome: string | undefined;

  beforeEach(() => {
    originalShepHome = process.env.SHEP_HOME;
    home = mkdtempSync(join(tmpdir(), 'shep-worker-log-path-'));
    process.env.SHEP_HOME = home;
  });

  afterEach(() => {
    if (originalShepHome === undefined) delete process.env.SHEP_HOME;
    else process.env.SHEP_HOME = originalShepHome;
    rmSync(home, { recursive: true, force: true });
  });

  it('resolves the worker log under SHEP_HOME, where the worker writes it', () => {
    const useCase = new GetWorkerLogPathUseCase(new LogFileStoreService());

    expect(useCase.execute('run-123')).toBe(join(home, 'logs', 'worker-run-123.log'));
  });
});
