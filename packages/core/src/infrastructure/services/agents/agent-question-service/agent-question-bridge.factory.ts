/**
 * AgentQuestionBridgeFactory (spec 134)
 *
 * Builds the {@link AgentQuestionExecutorBridge} for one interactive chat
 * session, scoped the way the unified inbox reads questions:
 *  - an Application chat → that Application;
 *  - a feature chat → the Application that owns the feature's repository,
 *    else the repository path (the same fallback the gate publisher uses);
 *  - a repository or global chat → the Application at its working directory,
 *    else that directory.
 * The session id is the question's `agentRunId`.
 */

import { inject, injectable } from 'tsyringe';

import type { IAgentQuestionRepository } from '@/application/ports/output/repositories/agent-question-repository.interface.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import { AskAgentQuestionUseCase } from '@/application/use-cases/agents/ask-agent-question.use-case.js';
import { AnswerAgentQuestionUseCase } from '@/application/use-cases/agents/answer-agent-question.use-case.js';
import { CancelAgentQuestionUseCase } from '@/application/use-cases/agents/cancel-agent-question.use-case.js';
import { applicationIdFromFeatureId } from '@/domain/shared/feature-id.js';
import { questionScopeForPath } from '@/application/use-cases/agents/question-scope.js';
import {
  AgentQuestionExecutorBridge,
  type AgentQuestionExecutorBridgeScope,
  type LiveQuestionSurface,
} from './agent-question-executor-bridge.js';

/** Identifies the chat session a bridge serves. */
export interface ChatQuestionScope {
  /** The session's polymorphic scope key (feature id, application key, repo key, "global"). */
  scopeKey: string;
  /** The session's working directory. */
  worktreePath: string;
  /** Interactive session id — recorded as the question's agentRunId. */
  sessionId: string;
}

@injectable()
export class AgentQuestionBridgeFactory {
  constructor(
    @inject(AskAgentQuestionUseCase) private readonly ask: AskAgentQuestionUseCase,
    @inject(AnswerAgentQuestionUseCase) private readonly answer: AnswerAgentQuestionUseCase,
    @inject(CancelAgentQuestionUseCase) private readonly cancel: CancelAgentQuestionUseCase,
    @inject('IAgentQuestionRepository') private readonly questions: IAgentQuestionRepository,
    @inject('IFeatureRepository') private readonly features: IFeatureRepository,
    @inject('IApplicationRepository') private readonly applications: IApplicationRepository
  ) {}

  async create(
    session: ChatQuestionScope,
    liveSurface: LiveQuestionSurface
  ): Promise<AgentQuestionExecutorBridge> {
    const scope = await this.resolveScope(session);
    return new AgentQuestionExecutorBridge(
      { ask: this.ask, answer: this.answer, cancel: this.cancel, questions: this.questions },
      scope,
      liveSurface
    );
  }

  private async resolveScope(
    session: ChatQuestionScope
  ): Promise<AgentQuestionExecutorBridgeScope> {
    const agentRunId = session.sessionId;
    const applicationId = applicationIdFromFeatureId(session.scopeKey);
    if (applicationId) return { appId: applicationId, agentRunId };

    const feature = await this.features.findById(session.scopeKey).catch(() => null);
    if (feature) {
      return {
        appId: await this.appIdForPath(feature.repositoryPath),
        featureId: session.scopeKey,
        agentRunId,
      };
    }
    return { appId: await this.appIdForPath(session.worktreePath), agentRunId };
  }

  private appIdForPath(path: string): Promise<string> {
    return questionScopeForPath(this.applications, path);
  }
}
