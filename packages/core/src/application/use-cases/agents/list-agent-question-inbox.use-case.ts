/**
 * ListAgentQuestionInboxUseCase (spec 134)
 *
 * The unified inbox: every question across every scope it was written under —
 * an Application id, or a repository path when the repository has no
 * Application (gate questions and chat questions fall back to it). Each scope
 * is still read on its own (NFR-7); results are merged newest first.
 */

import { inject, injectable } from 'tsyringe';

import type { IAgentQuestionRepository } from '../../ports/output/repositories/agent-question-repository.interface.js';
import type { AgentQuestion, AgentQuestionStatus } from '../../../domain/generated/output.js';

export interface ListAgentQuestionInboxInput {
  /** Limit to one scope. */
  appId?: string;
  featureId?: string;
  status?: AgentQuestionStatus;
}

function createdAtMs(question: AgentQuestion): number {
  return new Date(question.createdAt).getTime();
}

@injectable()
export class ListAgentQuestionInboxUseCase {
  constructor(
    @inject('IAgentQuestionRepository')
    private readonly questionRepository: IAgentQuestionRepository
  ) {}

  async execute(input: ListAgentQuestionInboxInput): Promise<AgentQuestion[]> {
    const scopes = input.appId ? [input.appId] : await this.questionRepository.listAppIds();
    const lists = await Promise.all(
      scopes.map((appId) =>
        this.questionRepository.listByScope(appId, input.featureId, { status: input.status })
      )
    );
    return lists.flat().sort((a, b) => createdAtMs(b) - createdAtMs(a));
  }
}
