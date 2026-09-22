/**
 * CancelAgentQuestionUseCase
 *
 * Marks a pending {@link AgentQuestion} as `cancelled`. Rejects the
 * matching {@link IDeferredQuestionRegistry} entry so any in-process
 * awaiter (e.g. an SDK V2 `canUseTool` callback) fails-fast with
 * {@link AgentQuestionCancelledError} instead of waiting for an answer
 * that will never come.
 *
 * Feature-flag short-circuit: with `featureFlags.collaboration` off, the
 * use case is a no-op (NFR-14 byte-identical default).
 */

import { inject, injectable } from 'tsyringe';

import type { IAgentQuestionRepository } from '../../ports/output/repositories/agent-question-repository.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type {
  CancelAgentQuestionInput,
  IDeferredQuestionRegistry,
} from '../../ports/output/agents/agent-question-service.interface.js';
import { AgentQuestionStatus, type AgentQuestion } from '../../../domain/generated/output.js';

export interface CancelAgentQuestionResult {
  enabled: boolean;
  question?: AgentQuestion;
  /**
   * Set when the question was no longer pending — already answered or
   * cancelled, possibly by a concurrent caller. Nothing was written.
   */
  alreadySettledAs?: AgentQuestionStatus;
}

@injectable()
export class CancelAgentQuestionUseCase {
  constructor(
    @inject('IAgentQuestionRepository')
    private readonly questionRepository: IAgentQuestionRepository,
    @inject('IDeferredQuestionRegistry')
    private readonly deferredRegistry: IDeferredQuestionRegistry,
    @inject('ISettingsRepository')
    private readonly settings: ISettingsRepository
  ) {}

  async execute(input: CancelAgentQuestionInput): Promise<CancelAgentQuestionResult> {
    const flagOn = await this.isCollaborationEnabled();
    if (!flagOn) return { enabled: false };

    const existing = await this.questionRepository.findById(input.appId, input.questionId);
    if (!existing) return { enabled: true };
    if (existing.status !== AgentQuestionStatus.pending) {
      return { enabled: true, question: existing, alreadySettledAs: existing.status };
    }

    const now = new Date();
    const settled = await this.questionRepository.settlePending(
      input.appId,
      input.questionId,
      AgentQuestionStatus.cancelled,
      {
        answer: input.reason,
        answeredBy: input.cancelledBy,
        answeredAt: now,
      }
    );
    if (!settled) {
      // Answered or cancelled by a concurrent caller — never overwrite it.
      const current =
        (await this.questionRepository.findById(input.appId, input.questionId)) ?? existing;
      return { enabled: true, question: current, alreadySettledAs: current.status };
    }

    if (this.deferredRegistry.has(input.questionId)) {
      this.deferredRegistry.reject(input.questionId, input.reason);
    }

    const updated = await this.questionRepository.findById(input.appId, input.questionId);
    return { enabled: true, question: updated ?? existing };
  }

  private async isCollaborationEnabled(): Promise<boolean> {
    const settings = await this.settings.load();
    return settings?.featureFlags?.collaboration === true;
  }
}
