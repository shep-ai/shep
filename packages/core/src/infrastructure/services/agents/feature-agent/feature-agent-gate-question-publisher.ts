/**
 * FeatureAgentGateQuestionPublisher
 *
 * Thin wrapper around {@link AskAgentQuestionUseCase} so the feature-agent
 * worker can emit ONE {@link AgentQuestion} of kind `blocking` whenever
 * an approval gate transitions an `AgentRun` to `waiting_approval`
 * (spec 093, task 20).
 *
 * The unified inbox (web + CLI) reads `agent_questions` rows for both
 * interactive-mode AskUserQuestion AND background-mode gate transitions
 * — this publisher is the background-mode write path. It does NOT change
 * the existing approval-gate state machine; it only emits a parallel
 * record so the inbox covers both modes.
 *
 * Scope derivation mirrors {@link FeatureAgentLifecyclePublisher}: try
 * to resolve a registered Application for the worker's repository path
 * and fall back to the repository path itself when none exists.
 *
 * Failures are swallowed: a question-emit error MUST NOT crash the
 * feature-agent worker. The lifecycle publisher's `publishBlocked` call
 * is the canonical signal for SSE clients; this publisher is additive.
 */

import { inject, injectable } from 'tsyringe';

import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import { AskAgentQuestionUseCase } from '@/application/use-cases/agents/ask-agent-question.use-case.js';
import { AgentQuestionAnswerer, AgentQuestionKind } from '@/domain/generated/output.js';
import { buildApprovalGateDecision } from '@/domain/shared/decision-builders.js';

export interface GateQuestionInput {
  runId: string;
  featureId: string;
  repositoryPath: string;
  /** Node label that triggered the interrupt (e.g. 'prd', 'plan', 'merge'). */
  interruptNode?: string;
}

@injectable()
export class FeatureAgentGateQuestionPublisher {
  constructor(
    @inject(AskAgentQuestionUseCase)
    private readonly askAgentQuestion: AskAgentQuestionUseCase,
    @inject('IApplicationRepository')
    private readonly applicationRepo: IApplicationRepository
  ) {}

  async publishWaitingApproval(input: GateQuestionInput): Promise<void> {
    try {
      const appId = await this.resolveAppId(input.repositoryPath);
      // Spec 134: a readable approval decision (Approve / Reject / typed
      // feedback) that every surface renders, instead of a JSON prompt.
      const decision = buildApprovalGateDecision(input.runId, input.interruptNode);
      const result = await this.askAgentQuestion.execute({
        appId,
        featureId: input.featureId,
        agentRunId: input.runId,
        kind: AgentQuestionKind.blocking,
        prompt: decision.title ?? decision.questions[0].question,
        decision,
        answerer: AgentQuestionAnswerer.either,
      });
      // The blocking AskAgentQuestion registers a Deferred awaiter. The
      // background gate flow does NOT await it — the answer flows
      // through ApproveAgentRunUseCase / RejectAgentRunUseCase. Attach a
      // no-op catch so the eventual timeout/cancel never surfaces as an
      // unhandled rejection in the worker process.
      if (result.awaiter) {
        result.awaiter.catch(() => undefined);
      }
    } catch {
      // Bus / DB outage must not crash the feature-agent worker.
    }
  }

  private async resolveAppId(repositoryPath: string): Promise<string> {
    try {
      const app = await this.applicationRepo.findByPath(repositoryPath);
      if (app?.id) return app.id;
    } catch {
      // Fall through to path-based scope.
    }
    return repositoryPath;
  }
}
