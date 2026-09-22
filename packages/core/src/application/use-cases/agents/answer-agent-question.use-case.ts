/**
 * AnswerAgentQuestionUseCase
 *
 * Records an answer for a pending {@link AgentQuestion} and:
 *  - validates the answer against the question's options when present,
 *  - transitions status to `answered`,
 *  - resolves the matching {@link IDeferredQuestionRegistry} entry so the
 *    SDK V2 `canUseTool` callback awaiting the answer returns,
 *  - for background-emitted questions tied to an approval gate, forwards
 *    `approve` / `reject` answers to the existing
 *    {@link ApproveAgentRunUseCase} / {@link RejectAgentRunUseCase} so the
 *    underlying gate state machine remains the single source of truth.
 *
 * Gate-linkage detection: a question is treated as gate-linked when its
 * `agentRunId` references a run currently in `waitingApproval` AND the
 * caller's answer matches the gate-vocabulary (`approve` / `reject`).
 * This keeps the unified-inbox surface backwards-compatible with the
 * existing approval flow without inventing a parallel pause primitive.
 */

import { inject, injectable } from 'tsyringe';

import type { IAgentQuestionRepository } from '../../ports/output/repositories/agent-question-repository.interface.js';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type { IAgentRunRepository } from '../../ports/output/agents/agent-run-repository.interface.js';
import type {
  AnswerAgentQuestionInput,
  IDeferredQuestionRegistry,
} from '../../ports/output/agents/agent-question-service.interface.js';
import {
  AgentQuestionStatus,
  AgentRunStatus,
  type AgentQuestion,
} from '../../../domain/generated/output.js';
import { ApproveAgentRunUseCase } from './approve-agent-run.use-case.js';
import { RejectAgentRunUseCase } from './reject-agent-run.use-case.js';

export interface AnswerAgentQuestionResult {
  /** True when the collaboration feature flag is on and the answer was applied. */
  enabled: boolean;
  /** The updated question — populated only when `enabled` is true and the question existed. */
  question?: AgentQuestion;
  /** True when the answer was forwarded to the approval-gate use case. */
  forwardedToGate: boolean;
  /**
   * Set when the question was no longer pending — already answered or
   * cancelled, possibly by a concurrent caller. Nothing was written.
   */
  alreadySettledAs?: AgentQuestionStatus;
}

/** Canonical approve/reject vocabulary used by gate-linked questions. */
const GATE_APPROVE_ANSWERS: ReadonlySet<string> = new Set(['approve', 'approved', 'yes']);
const GATE_REJECT_ANSWERS: ReadonlySet<string> = new Set(['reject', 'rejected', 'no']);

@injectable()
export class AnswerAgentQuestionUseCase {
  constructor(
    @inject('IAgentQuestionRepository')
    private readonly questionRepository: IAgentQuestionRepository,
    @inject('IDeferredQuestionRegistry')
    private readonly deferredRegistry: IDeferredQuestionRegistry,
    @inject('ISettingsRepository')
    private readonly settings: ISettingsRepository,
    @inject('IAgentRunRepository')
    private readonly agentRunRepository: IAgentRunRepository,
    @inject(ApproveAgentRunUseCase)
    private readonly approveAgentRun: ApproveAgentRunUseCase,
    @inject(RejectAgentRunUseCase)
    private readonly rejectAgentRun: RejectAgentRunUseCase
  ) {}

  async execute(input: AnswerAgentQuestionInput): Promise<AnswerAgentQuestionResult> {
    const flagOn = await this.isCollaborationEnabled();
    if (!flagOn) return { enabled: false, forwardedToGate: false };

    const existing = await this.questionRepository.findById(input.appId, input.questionId);
    if (!existing) return { enabled: true, forwardedToGate: false };
    if (existing.status !== AgentQuestionStatus.pending) {
      return this.alreadySettled(input, existing);
    }

    validateAnswerAgainstOptions(existing, input.answer);

    const now = new Date();
    const settled = await this.questionRepository.settlePending(
      input.appId,
      input.questionId,
      AgentQuestionStatus.answered,
      {
        answer: input.answer,
        answeredBy: input.answeredBy,
        answeredAt: now,
      }
    );
    // Another caller (CLI vs web) settled it between our read and our write.
    if (!settled) return this.alreadySettled(input, existing);

    // Resolve any in-process awaiter so the SDK callback returns.
    if (this.deferredRegistry.has(input.questionId)) {
      this.deferredRegistry.resolve(input.questionId, input.answer);
    }

    // Forward to the approval-gate use case when the question is gate-linked.
    const forwardedToGate = await this.maybeForwardToGate(existing, input);

    const updated = await this.questionRepository.findById(input.appId, input.questionId);
    return { enabled: true, question: updated ?? existing, forwardedToGate };
  }

  private async alreadySettled(
    input: AnswerAgentQuestionInput,
    fallback: AgentQuestion
  ): Promise<AnswerAgentQuestionResult> {
    const current =
      (await this.questionRepository.findById(input.appId, input.questionId)) ?? fallback;
    return {
      enabled: true,
      question: current,
      forwardedToGate: false,
      alreadySettledAs: current.status,
    };
  }

  private async maybeForwardToGate(
    question: AgentQuestion,
    input: AnswerAgentQuestionInput
  ): Promise<boolean> {
    const verdict = mapAnswerToGateVerdict(input.answer);
    if (!verdict) return false;

    const run = await this.agentRunRepository.findById(question.agentRunId);
    if (!run || run.status !== AgentRunStatus.waitingApproval) return false;

    if (verdict === 'approve') {
      await this.approveAgentRun.execute(run.id);
    } else {
      await this.rejectAgentRun.execute(run.id, input.answer);
    }
    return true;
  }

  private async isCollaborationEnabled(): Promise<boolean> {
    const settings = await this.settings.load();
    return settings?.featureFlags?.collaboration === true;
  }
}

function validateAnswerAgainstOptions(question: AgentQuestion, answer: string): void {
  if (!question.optionsJson) return;
  let options: unknown;
  try {
    options = JSON.parse(question.optionsJson);
  } catch {
    return; // Malformed options column; trust the answer rather than rejecting.
  }
  if (!Array.isArray(options) || options.length === 0) return;
  if (!options.includes(answer)) {
    throw new Error(
      `AnswerAgentQuestion: answer "${answer}" is not one of the allowed options for question ${question.id}`
    );
  }
}

function mapAnswerToGateVerdict(answer: string): 'approve' | 'reject' | null {
  const normalized = answer.trim().toLowerCase();
  if (GATE_APPROVE_ANSWERS.has(normalized)) return 'approve';
  if (GATE_REJECT_ANSWERS.has(normalized)) return 'reject';
  return null;
}
