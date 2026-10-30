import { describe, it, expect, vi } from 'vitest';
import {
  learnFromRun,
  runSignalsFromState,
} from '@/infrastructure/services/agents/feature-agent/learn-from-run.js';
import { AgentType } from '@/domain/generated/output.js';

const INPUT = {
  featureId: 'feat-1',
  repositoryPath: '/repos/app',
  worktreePath: '/wt',
  agentType: AgentType.ClaudeCode,
  agentRunId: 'run-1',
};

describe('runSignalsFromState', () => {
  it('reads the run signals from the final graph state', () => {
    expect(
      runSignalsFromState({
        merged: true,
        ciStatus: 'success',
        ciFixAttempts: 2,
        ciFixHistory: [{ attempt: 1, startedAt: 't', failureSummary: 'lint', outcome: 'fixed' }],
        feedbackHistory: ['add tests'],
        validationRetries: 1,
        lastValidationErrors: ['x'],
        error: null,
      })
    ).toEqual({
      merged: true,
      ciStatus: 'success',
      ciFixAttempts: 2,
      ciFixHistory: [{ attempt: 1, startedAt: 't', failureSummary: 'lint', outcome: 'fixed' }],
      rejectionFeedback: ['add tests'],
      validationRepairs: 1,
      lastValidationErrors: ['x'],
      error: null,
    });
  });

  it('defaults every signal when the state is missing or malformed', () => {
    expect(runSignalsFromState(undefined)).toEqual({
      merged: false,
      ciStatus: null,
      ciFixAttempts: 0,
      ciFixHistory: [],
      rejectionFeedback: [],
      validationRepairs: 0,
      lastValidationErrors: [],
      error: null,
    });
    expect(runSignalsFromState({ ciFixAttempts: 'x', feedbackHistory: 'nope' }).ciFixAttempts).toBe(
      0
    );
  });

  it('uses the thrown error when the state has none', () => {
    expect(runSignalsFromState({}, 'boom').error).toBe('boom');
  });
});

describe('learnFromRun', () => {
  it('records the outcome for the pinned version, then reflects', async () => {
    const order: string[] = [];
    const deps = {
      recordOutcome: { execute: vi.fn(async () => void order.push('outcome')) },
      reflect: {
        execute: vi.fn(async () => {
          order.push('reflect');
          return { skipped: false, costUsd: 1 };
        }),
      },
      log: vi.fn(),
    };
    await learnFromRun(deps, { ...INPUT, versionId: 'v1', state: { merged: true } });
    expect(order).toEqual(['outcome', 'reflect']);
    expect(deps.recordOutcome.execute).toHaveBeenCalledWith(
      expect.objectContaining({ versionId: 'v1', featureId: 'feat-1' })
    );
    expect(deps.reflect.execute).toHaveBeenCalledWith(
      expect.objectContaining({ featureId: 'feat-1', versionId: 'v1' }),
      'run-1'
    );
  });

  it('skips the outcome when the run used no learned version', async () => {
    const deps = {
      recordOutcome: { execute: vi.fn() },
      reflect: { execute: vi.fn(async () => ({ skipped: true, costUsd: 0 })) },
      log: vi.fn(),
    };
    await learnFromRun(deps, { ...INPUT, state: {} });
    expect(deps.recordOutcome.execute).not.toHaveBeenCalled();
    expect(deps.reflect.execute).toHaveBeenCalled();
  });

  it('never throws', async () => {
    const deps = {
      recordOutcome: { execute: vi.fn(async () => Promise.reject(new Error('db'))) },
      reflect: { execute: vi.fn(async () => Promise.reject(new Error('agent'))) },
      log: vi.fn(),
    };
    await expect(
      learnFromRun(deps, { ...INPUT, versionId: 'v1', state: {} })
    ).resolves.toBeUndefined();
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('agent'));
  });
});
