'use server';

import { resolve } from '@/lib/server-container';
import type { RejectAgentRunUseCase } from '@shepai/core/application/use-cases/agents/reject-agent-run.use-case';
import type { IFeatureRepository } from '@shepai/core/application/ports/output/repositories/feature-repository.interface';
import { FeatureMode } from '@shepai/core/domain/generated/output';

/**
 * Submit feedback on an exploration prototype. This resumes the exploration
 * graph with the feedback text, triggering the next iteration. Internally
 * uses the RejectAgentRunUseCase since exploration feedback follows the
 * same interrupt/resume mechanism as approval gate rejections.
 */
export async function submitExplorationFeedback(
  featureId: string,
  feedback: string
): Promise<{ submitted: boolean; iteration?: number; error?: string }> {
  if (!featureId.trim()) {
    return { submitted: false, error: 'Feature id is required' };
  }

  if (!feedback.trim()) {
    return { submitted: false, error: 'Feedback is required' };
  }

  try {
    const featureRepo = resolve<IFeatureRepository>('IFeatureRepository');
    const feature = await featureRepo.findById(featureId);

    if (!feature) {
      return { submitted: false, error: 'Feature not found' };
    }

    if (feature.mode !== FeatureMode.Exploration) {
      return { submitted: false, error: 'Feature is not in exploration mode' };
    }

    if (!feature.agentRunId) {
      return { submitted: false, error: 'Feature has no agent run' };
    }

    const rejectUseCase = resolve<RejectAgentRunUseCase>('RejectAgentRunUseCase');
    const result = await rejectUseCase.execute(feature.agentRunId, feedback);

    if (!result.rejected) {
      return { submitted: false, error: result.reason };
    }

    return { submitted: true, iteration: result.iteration };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to submit feedback';
    return { submitted: false, error: message };
  }
}
