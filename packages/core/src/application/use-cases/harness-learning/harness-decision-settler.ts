/**
 * Closes the inbox question of a learned-harness candidate when the candidate
 * is adopted, rejected or replaced anywhere else (the Learned harness page,
 * `shep learn`), so no surface keeps asking about a settled version.
 */

import { inject, injectable } from 'tsyringe';
import {
  AgentQuestionStatus,
  type LearnedHarnessVersion,
} from '../../../domain/generated/output.js';
import { HARNESS_QUESTION_PREFIX } from '../../../domain/harness-learning/harness-decision.js';
import type { IAgentQuestionRepository } from '../../ports/output/repositories/agent-question-repository.interface.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import { questionScopeForPath } from '../agents/question-scope.js';

@injectable()
export class HarnessDecisionSettler {
  constructor(
    @inject('IAgentQuestionRepository') private readonly questions: IAgentQuestionRepository,
    @inject('IApplicationRepository') private readonly applications: IApplicationRepository
  ) {}

  /** Settle the pending question about this version, if any. Never throws. */
  async settle(version: LearnedHarnessVersion, outcome: string, actor: string): Promise<void> {
    try {
      const appId = await questionScopeForPath(this.applications, version.repositoryPath);
      const pending = await this.questions.listByScope(appId, version.sourceFeatureId, {
        status: AgentQuestionStatus.pending,
      });
      const questionId = `${HARNESS_QUESTION_PREFIX}${version.id}`;
      const match = pending.find((q) => q.decision?.questions.some((d) => d.id === questionId));
      if (!match) return;
      await this.questions.settlePending(appId, match.id, AgentQuestionStatus.answered, {
        answer: outcome,
        answeredBy: actor,
        answeredAt: new Date(),
      });
    } catch {
      // The decision is recorded on the version; a stale inbox entry is cosmetic.
    }
  }
}
