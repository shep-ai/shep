/**
 * Run Feature Console Action Use Case (spec 142)
 *
 * The one entry point for the feature console's action keys. Resolves the
 * feature (by id or id prefix) and its current run, refuses an action the
 * domain does not offer for that run, and drives the existing approve, reject,
 * stop and resume use cases. Never throws: every outcome is a result the
 * console can show.
 */

import { inject, injectable } from 'tsyringe';
import { FeatureConsoleAction } from '../../../domain/generated/output.js';
import type { AgentRun, Feature } from '../../../domain/generated/output.js';
import { availableFeatureActions } from '../../../domain/shared/feature-state.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type { IFeatureRepository } from '../../ports/output/repositories/feature-repository.interface.js';
import { ApproveAgentRunUseCase } from '../agents/approve-agent-run.use-case.js';
import { RejectAgentRunUseCase } from '../agents/reject-agent-run.use-case.js';
import { StopAgentRunUseCase } from '../agents/stop-agent-run.use-case.js';
import { ResumeFeatureUseCase } from '../features/resume-feature.use-case.js';
import {
  FEATURE_SHORT_ID_LENGTH,
  type FeatureConsoleActionResult,
} from './feature-console.types.js';

export interface RunFeatureConsoleActionInput {
  /** Feature id or id prefix. */
  featureId: string;
  action: FeatureConsoleAction;
  /** Required for {@link FeatureConsoleAction.Reject}. */
  feedback?: string;
}

/** Past participle per action, for "cannot be … right now". */
const ACTION_PAST_TENSE: Record<FeatureConsoleAction, string> = {
  [FeatureConsoleAction.Approve]: 'approved',
  [FeatureConsoleAction.Reject]: 'rejected',
  [FeatureConsoleAction.Stop]: 'stopped',
  [FeatureConsoleAction.Resume]: 'resumed',
};

@injectable()
export class RunFeatureConsoleActionUseCase {
  constructor(
    @inject('IFeatureRepository')
    private readonly featureRepo: IFeatureRepository,
    @inject('IAgentRunRepository')
    private readonly runRepo: IAgentRunRepository,
    @inject(ApproveAgentRunUseCase)
    private readonly approve: ApproveAgentRunUseCase,
    @inject(RejectAgentRunUseCase)
    private readonly reject: RejectAgentRunUseCase,
    @inject(StopAgentRunUseCase)
    private readonly stop: StopAgentRunUseCase,
    @inject(ResumeFeatureUseCase)
    private readonly resume: ResumeFeatureUseCase
  ) {}

  async execute(input: RunFeatureConsoleActionInput): Promise<FeatureConsoleActionResult> {
    try {
      const feature =
        (await this.featureRepo.findById(input.featureId)) ??
        (await this.featureRepo.findByIdPrefix(input.featureId));
      if (!feature) {
        return failed(`Feature not found: ${input.featureId}`);
      }

      const run = feature.agentRunId ? await this.runRepo.findById(feature.agentRunId) : null;
      if (!run) {
        return failed(`${feature.name} has no agent run yet.`);
      }

      if (!availableFeatureActions(run).includes(input.action)) {
        return failed(`${feature.name} cannot be ${ACTION_PAST_TENSE[input.action]} right now.`);
      }

      return await this.dispatch(input, feature, run);
    } catch (error) {
      return failed(error instanceof Error ? error.message : String(error));
    }
  }

  private async dispatch(
    input: RunFeatureConsoleActionInput,
    feature: Feature,
    run: AgentRun
  ): Promise<FeatureConsoleActionResult> {
    switch (input.action) {
      case FeatureConsoleAction.Approve: {
        const result = await this.approve.execute(run.id);
        return { ok: result.approved, message: result.reason };
      }
      case FeatureConsoleAction.Reject: {
        const feedback = input.feedback?.trim();
        if (!feedback) {
          return failed('Feedback is required to reject.');
        }
        const result = await this.reject.execute(run.id, feedback);
        return { ok: result.rejected, message: result.reason };
      }
      case FeatureConsoleAction.Stop: {
        const result = await this.stop.execute(run.id);
        return { ok: result.stopped, message: result.reason };
      }
      case FeatureConsoleAction.Resume: {
        const { newRun } = await this.resume.execute(feature.id);
        return {
          ok: true,
          message: `Resumed as run ${newRun.id.slice(0, FEATURE_SHORT_ID_LENGTH)}`,
        };
      }
    }
  }
}

function failed(message: string): FeatureConsoleActionResult {
  return { ok: false, message };
}
