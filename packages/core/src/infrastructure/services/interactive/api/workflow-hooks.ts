/**
 * WorkflowHooks
 *
 * Orchestrator-facing hooks for workflow step coordination.
 * Exposes setActiveStep, clearActiveStep, notifyWorkflowStep, and waitForTurnDone.
 *
 * Extracted from `InteractiveSessionService` in Phase 6 of the strangler refactor.
 * See `docs/plans/2026-04-14-interactive-session-service-refactor.md`.
 */

import type { WorkflowStep } from '../../../../domain/generated/output.js';
import type { SessionRegistry } from '../core/session-registry.js';
import type { StreamEventDispatcher } from '../core/stream-event-dispatcher.js';

export class WorkflowHooks {
  constructor(
    private readonly registry: SessionRegistry,
    private readonly dispatcher: StreamEventDispatcher
  ) {}

  setActiveStep(featureId: string, stepId: string): void {
    this.registry.setActiveStep(featureId, stepId);
  }

  clearActiveStep(featureId: string): void {
    this.registry.clearActiveStep(featureId);
  }

  notifyWorkflowStep(featureId: string, step: WorkflowStep): void {
    this.dispatcher.notifyByFeatureId(featureId, {
      delta: '',
      done: false,
      workflowStep: step,
    });
  }

  /**
   * Resolves the next time any subscriber receives a `done: true`
   * chunk for the given feature.
   */
  async waitForTurnDone(featureId: string, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('waitForTurnDone aborted'));
        return;
      }
      const unsubscribe = this.dispatcher.subscribeByFeature(featureId, (chunk) => {
        if (chunk.done) {
          unsubscribe();
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }
      });
      const onAbort = () => {
        unsubscribe();
        signal?.removeEventListener('abort', onAbort);
        reject(new Error('waitForTurnDone aborted'));
      };
      signal?.addEventListener('abort', onAbort);
    });
  }
}
