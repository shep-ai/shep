/**
 * GetFeatureLogTailUseCase Unit Tests (spec 142)
 *
 * The console's log pane: the last lines of the feature's CURRENT run log,
 * read through the log store port. A feature with no run has no log yet.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';

import { GetFeatureLogTailUseCase } from '@/application/use-cases/feature-console/get-feature-log-tail.use-case.js';
import { GetWorkerLogPathUseCase } from '@/application/use-cases/logs/get-worker-log-path.use-case.js';
import type { Feature } from '@/domain/generated/output.js';
import type { ILogFileStore } from '@/application/ports/output/services/log-file-store.interface.js';

const LOGS = join('home', 'logs');

describe('GetFeatureLogTailUseCase', () => {
  let feature: Feature | null;
  let featureRepo: { findById: ReturnType<typeof vi.fn>; findByIdPrefix: ReturnType<typeof vi.fn> };
  let readTail: ReturnType<typeof vi.fn<ILogFileStore['readTail']>>;
  let store: ILogFileStore;
  let useCase: GetFeatureLogTailUseCase;

  beforeEach(() => {
    feature = { id: 'feat-1', name: 'Billing UI', agentRunId: 'run-9' } as Feature;
    featureRepo = {
      findById: vi.fn(async (id: string) => (feature?.id === id ? feature : null)),
      findByIdPrefix: vi.fn(async () => null),
    };
    readTail = vi.fn<ILogFileStore['readTail']>(async () => [
      '[text] planning',
      '[tool] Read src/app.ts',
    ]);
    store = {
      getLogsDirectory: () => LOGS,
      list: async () => [],
      remove: async () => undefined,
      readTail,
    };
    useCase = new GetFeatureLogTailUseCase(
      featureRepo as never,
      new GetWorkerLogPathUseCase(store),
      store
    );
  });

  it('reads the tail of the current run log', async () => {
    const tail = await useCase.execute('feat-1', 40);

    const expectedPath = new GetWorkerLogPathUseCase(store).execute('run-9');
    expect(readTail).toHaveBeenCalledWith(expectedPath, 40);
    expect(tail).toEqual({
      logPath: expectedPath,
      lines: ['[text] planning', '[tool] Read src/app.ts'],
    });
  });

  it('returns no lines for a feature without a run, or an unknown feature', async () => {
    feature = { id: 'feat-1', name: 'Billing UI' } as Feature;
    expect(await useCase.execute('feat-1', 40)).toEqual({ lines: [] });
    expect(await useCase.execute('missing', 40)).toEqual({ lines: [] });
    expect(readTail).not.toHaveBeenCalled();
  });
});
