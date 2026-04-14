/**
 * WorkflowHooks Unit Tests
 *
 * TDD: RED → GREEN → REFACTOR
 *
 * Covers setActiveStep, clearActiveStep, notifyWorkflowStep, waitForTurnDone.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { WorkflowHooks } from '@/infrastructure/services/interactive/api/workflow-hooks.js';
import { SessionRegistry } from '@/infrastructure/services/interactive/core/session-registry.js';
import { StreamEventDispatcher } from '@/infrastructure/services/interactive/core/stream-event-dispatcher.js';
import type { WorkflowStep } from '@/domain/generated/output.js';
import { WorkflowStepStatus } from '@/domain/generated/output.js';

function makeStep(id: string, featureId: string): WorkflowStep {
  return {
    id,
    sessionId: 'session-1',
    workflowId: 'wf-1',
    featureId,
    stepKey: 'step-key',
    stepIndex: 0,
    title: 'Step',
    description: '',
    name: 'Step',
    status: WorkflowStepStatus.running,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as WorkflowStep;
}

describe('WorkflowHooks', () => {
  let registry: SessionRegistry;
  let eventDispatcher: StreamEventDispatcher;
  let hooks: WorkflowHooks;

  beforeEach(() => {
    registry = new SessionRegistry();
    eventDispatcher = new StreamEventDispatcher(registry);
    hooks = new WorkflowHooks(registry, eventDispatcher);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setActiveStep', () => {
    it('delegates to registry', () => {
      const spy = vi.spyOn(registry, 'setActiveStep');
      hooks.setActiveStep('feat-1', 'step-1');
      expect(spy).toHaveBeenCalledWith('feat-1', 'step-1');
    });
  });

  describe('clearActiveStep', () => {
    it('delegates to registry', () => {
      const spy = vi.spyOn(registry, 'clearActiveStep');
      hooks.clearActiveStep('feat-1');
      expect(spy).toHaveBeenCalledWith('feat-1');
    });
  });

  describe('notifyWorkflowStep', () => {
    it('fans out a workflowStep chunk to feature subscribers', () => {
      const featureId = 'feat-notify-1';
      const step = makeStep('step-1', featureId);

      const received: unknown[] = [];
      eventDispatcher.subscribeByFeature(featureId, (chunk) => received.push(chunk));

      hooks.notifyWorkflowStep(featureId, step);

      expect(received).toHaveLength(1);
      expect((received[0] as any).workflowStep).toBe(step);
      expect((received[0] as any).done).toBe(false);
      expect((received[0] as any).delta).toBe('');
    });
  });

  describe('waitForTurnDone', () => {
    it('resolves when a done chunk is emitted', async () => {
      const featureId = 'feat-wait-done';
      const promise = hooks.waitForTurnDone(featureId);

      // Emit a non-done chunk first, then a done chunk
      eventDispatcher.notifyByFeatureId(featureId, { delta: 'partial', done: false });
      eventDispatcher.notifyByFeatureId(featureId, { delta: '', done: true });

      await expect(promise).resolves.toBeUndefined();
    });

    it('rejects when AbortSignal is already aborted', async () => {
      const featureId = 'feat-wait-abort';
      const controller = new AbortController();
      controller.abort();

      await expect(hooks.waitForTurnDone(featureId, controller.signal)).rejects.toThrow(
        'waitForTurnDone aborted'
      );
    });

    it('rejects when AbortSignal is aborted after waiting starts', async () => {
      const featureId = 'feat-wait-abort-2';
      const controller = new AbortController();

      const promise = hooks.waitForTurnDone(featureId, controller.signal);

      // Abort after the promise has been created
      controller.abort();

      await expect(promise).rejects.toThrow('waitForTurnDone aborted');
    });
  });
});
