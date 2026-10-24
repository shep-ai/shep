/**
 * RunFeatureConsoleActionUseCase Unit Tests (spec 142)
 *
 * One entry point for the console's action keys. It resolves the feature and
 * its current run, refuses an action the domain does not offer for that run,
 * and otherwise drives the EXISTING approve / reject / stop / resume use cases
 * — it invents no second path for any of them. It never throws: the console
 * shows the result on its status line.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RunFeatureConsoleActionUseCase } from '@/application/use-cases/feature-console/run-feature-console-action.use-case.js';
import { AgentRunStatus, FeatureConsoleAction } from '@/domain/generated/output.js';
import type { AgentRun, Feature } from '@/domain/generated/output.js';

describe('RunFeatureConsoleActionUseCase', () => {
  let feature: Feature | null;
  let run: AgentRun | null;
  let featureRepo: { findById: ReturnType<typeof vi.fn>; findByIdPrefix: ReturnType<typeof vi.fn> };
  let runRepo: { findById: ReturnType<typeof vi.fn> };
  let approve: { execute: ReturnType<typeof vi.fn> };
  let reject: { execute: ReturnType<typeof vi.fn> };
  let stop: { execute: ReturnType<typeof vi.fn> };
  let resume: { execute: ReturnType<typeof vi.fn> };
  let useCase: RunFeatureConsoleActionUseCase;

  const withRun = (status: AgentRunStatus) => {
    run = { id: 'run-1234567890', status } as AgentRun;
  };

  beforeEach(() => {
    feature = { id: 'feat-1', name: 'Billing UI', agentRunId: 'run-1234567890' } as Feature;
    run = null;
    featureRepo = {
      findById: vi.fn(async (id: string) => (feature && id === feature.id ? feature : null)),
      findByIdPrefix: vi.fn(async (prefix: string) =>
        feature?.id.startsWith(prefix) ? feature : null
      ),
    };
    runRepo = { findById: vi.fn(async () => run) };
    approve = { execute: vi.fn(async () => ({ approved: true, reason: 'Approved and resumed' })) };
    reject = { execute: vi.fn(async () => ({ rejected: true, reason: 'Rejected, iterating' })) };
    stop = { execute: vi.fn(async () => ({ stopped: true, reason: 'Agent stopped' })) };
    resume = {
      execute: vi.fn(async () => ({ feature, newRun: { id: 'run-new-abcdef12' } })),
    };
    useCase = new RunFeatureConsoleActionUseCase(
      featureRepo as never,
      runRepo as never,
      approve as never,
      reject as never,
      stop as never,
      resume as never
    );
  });

  it('approves a gate through ApproveAgentRunUseCase', async () => {
    withRun(AgentRunStatus.waitingApproval);

    const result = await useCase.execute({
      featureId: 'feat-1',
      action: FeatureConsoleAction.Approve,
    });

    expect(approve.execute).toHaveBeenCalledWith('run-1234567890');
    expect(result).toEqual({ ok: true, message: 'Approved and resumed' });
  });

  it('rejects a gate with the trimmed feedback', async () => {
    withRun(AgentRunStatus.waitingApproval);

    const result = await useCase.execute({
      featureId: 'feat-1',
      action: FeatureConsoleAction.Reject,
      feedback: '  split the API change out  ',
    });

    expect(reject.execute).toHaveBeenCalledWith('run-1234567890', 'split the API change out');
    expect(result.ok).toBe(true);
  });

  it('refuses a reject without feedback before reaching the use case', async () => {
    withRun(AgentRunStatus.waitingApproval);

    const result = await useCase.execute({
      featureId: 'feat-1',
      action: FeatureConsoleAction.Reject,
      feedback: '   ',
    });

    expect(reject.execute).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, message: 'Feedback is required to reject.' });
  });

  it('stops an executing run', async () => {
    withRun(AgentRunStatus.running);

    const result = await useCase.execute({
      featureId: 'feat-1',
      action: FeatureConsoleAction.Stop,
    });

    expect(stop.execute).toHaveBeenCalledWith('run-1234567890');
    expect(result).toEqual({ ok: true, message: 'Agent stopped' });
  });

  it('resumes an interrupted feature and names the new run', async () => {
    withRun(AgentRunStatus.interrupted);

    const result = await useCase.execute({
      featureId: 'feat-1',
      action: FeatureConsoleAction.Resume,
    });

    expect(resume.execute).toHaveBeenCalledWith('feat-1');
    expect(result).toEqual({ ok: true, message: 'Resumed as run run-new-' });
  });

  it('reports a delegate refusal as a failed result', async () => {
    withRun(AgentRunStatus.waitingApproval);
    approve.execute.mockResolvedValue({ approved: false, reason: 'Gate already decided' });

    const result = await useCase.execute({
      featureId: 'feat-1',
      action: FeatureConsoleAction.Approve,
    });

    expect(result).toEqual({ ok: false, message: 'Gate already decided' });
  });

  it('turns a thrown error into a failed result', async () => {
    withRun(AgentRunStatus.failed);
    resume.execute.mockRejectedValue(new Error('Feature "Billing UI" is missing specPath'));

    const result = await useCase.execute({
      featureId: 'feat-1',
      action: FeatureConsoleAction.Resume,
    });

    expect(result).toEqual({ ok: false, message: 'Feature "Billing UI" is missing specPath' });
  });

  it('refuses an action the run does not offer, without calling anything', async () => {
    withRun(AgentRunStatus.running);

    const result = await useCase.execute({
      featureId: 'feat-1',
      action: FeatureConsoleAction.Approve,
    });

    expect(approve.execute).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, message: 'Billing UI cannot be approved right now.' });
  });

  it('accepts an id prefix', async () => {
    withRun(AgentRunStatus.running);

    const result = await useCase.execute({ featureId: 'feat', action: FeatureConsoleAction.Stop });

    expect(result.ok).toBe(true);
  });

  it('fails cleanly for an unknown feature or a feature with no run', async () => {
    expect(await useCase.execute({ featureId: 'nope', action: FeatureConsoleAction.Stop })).toEqual(
      { ok: false, message: 'Feature not found: nope' }
    );

    feature = { id: 'feat-1', name: 'Billing UI' } as Feature;
    expect(
      await useCase.execute({ featureId: 'feat-1', action: FeatureConsoleAction.Stop })
    ).toEqual({ ok: false, message: 'Billing UI has no agent run yet.' });
  });
});
