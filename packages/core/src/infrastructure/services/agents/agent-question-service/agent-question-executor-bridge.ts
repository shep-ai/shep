/**
 * AgentQuestionExecutorBridge
 *
 * Concrete {@link AgentQuestionBridge} that routes an interactive agent's
 * `AskUserQuestion` (Claude Code `canUseTool`, Cursor ACP) through the unified
 * agent-question pipeline (spec 093, task 19; wired by spec 134).
 *
 * With `featureFlags.collaboration` ON, `ask()`:
 *  1. records ONE blocking {@link AgentQuestion} carrying a Live chat
 *     {@link Decision}, so the inbox, notifications and supervisor see it;
 *  2. shows the question in the chat through the {@link LiveQuestionSurface};
 *  3. returns whichever answer arrives first, and settles the other side —
 *     a chat answer records the inbox row as answered; an inbox (web / CLI)
 *     answer closes the chat question with the same answers.
 * If the inbox side ends without an answer (cancelled, timed out) the chat
 * keeps waiting. With the flag OFF it returns `null` and the executor falls
 * back to the legacy `onUserQuestion` path (NFR-14 byte-identical default).
 */

import type {
  AgentQuestionBridge,
  UserInteractionData,
} from '@/application/ports/output/agents/interactive-agent-executor.interface.js';
import type { IAgentQuestionRepository } from '@/application/ports/output/repositories/agent-question-repository.interface.js';
import type { AskAgentQuestionUseCase } from '@/application/use-cases/agents/ask-agent-question.use-case.js';
import type { AnswerAgentQuestionUseCase } from '@/application/use-cases/agents/answer-agent-question.use-case.js';
import type { CancelAgentQuestionUseCase } from '@/application/use-cases/agents/cancel-agent-question.use-case.js';
import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  DecisionResponseMode,
  type Decision,
} from '@/domain/generated/output.js';
import {
  answersByQuestionText,
  responsesFromAnswersByQuestionText,
} from '@/domain/shared/decision.js';
import { decisionFromUserQuestions } from '@/domain/shared/decision-builders.js';

/** Actor recorded when the chat answered a question the inbox also showed. */
export const CHAT_ANSWER_ACTOR = 'user:chat';
/** Actor recorded when the bridge closes the inbox side itself. */
const BRIDGE_ACTOR = 'agent:bridge';

/** Scope passed to AskAgentQuestion when the bridge is used. */
export interface AgentQuestionExecutorBridgeScope {
  appId: string;
  featureId?: string;
  agentRunId: string;
}

/** Use cases and the repository the bridge needs. */
export interface AgentQuestionBridgeDeps {
  ask: AskAgentQuestionUseCase;
  answer: AnswerAgentQuestionUseCase;
  cancel: CancelAgentQuestionUseCase;
  questions: IAgentQuestionRepository;
}

/** The chat side of a live question — implemented by the session's interaction coordinator. */
export interface LiveQuestionSurface {
  /** Show the question in the chat; resolves with the chat's answers. */
  ask(interaction: UserInteractionData): Promise<Record<string, string>>;
  /** Close the chat question with answers given on another surface. */
  settleFromElsewhere(answers: Record<string, string>): Promise<void>;
}

type Outcome =
  | { from: 'chat'; answers: Record<string, string> }
  | { from: 'inbox' }
  | { from: 'inbox-ended' };

export class AgentQuestionExecutorBridge implements AgentQuestionBridge {
  constructor(
    private readonly deps: AgentQuestionBridgeDeps,
    private readonly scope: AgentQuestionExecutorBridgeScope,
    private readonly liveSurface?: LiveQuestionSurface
  ) {}

  async ask(interaction: UserInteractionData): Promise<Record<string, string> | null> {
    const draft = decisionFromUserQuestions(
      interaction.toolCallId,
      interaction.questions,
      DecisionResponseMode.Live
    );
    const result = await this.deps.ask.execute({
      appId: this.scope.appId,
      featureId: this.scope.featureId,
      agentRunId: this.scope.agentRunId,
      kind: AgentQuestionKind.blocking,
      prompt: draft.questions[0]?.question ?? '',
      decision: draft,
      answerer: AgentQuestionAnswerer.either,
    });

    // Flag-off short-circuit: caller falls back to legacy onUserQuestion.
    if (!result.enabled || !result.question || !result.awaiter) return null;
    const questionId = result.question.id;
    const decision = result.question.decision ?? draft;
    const inbox: Promise<Outcome> = result.awaiter.then(
      () => ({ from: 'inbox' }),
      () => ({ from: 'inbox-ended' })
    );

    if (!this.liveSurface) {
      const outcome = await inbox;
      if (outcome.from !== 'inbox')
        throw new Error(`Agent question ${questionId} was not answered`);
      return this.readInboxAnswers(questionId, decision);
    }

    const chat = this.liveSurface
      .ask(interaction)
      .then((answers): Outcome => ({ from: 'chat', answers }));
    const first = await Promise.race([chat, inbox]);
    if (first.from === 'chat') {
      await this.recordChatAnswer(questionId, decision, first.answers);
      return first.answers;
    }
    if (first.from === 'inbox') {
      const answers = await this.readInboxAnswers(questionId, decision);
      await this.liveSurface.settleFromElsewhere(answers);
      return answers;
    }
    // The inbox side ended unanswered — the chat is now the only way to answer.
    const fromChat = (await chat) as Extract<Outcome, { from: 'chat' }>;
    return fromChat.answers;
  }

  private async recordChatAnswer(
    questionId: string,
    decision: Decision,
    answers: Record<string, string>
  ): Promise<void> {
    try {
      await this.deps.answer.execute({
        appId: this.scope.appId,
        questionId,
        responses: responsesFromAnswersByQuestionText(decision, answers),
        answeredBy: CHAT_ANSWER_ACTOR,
      });
    } catch {
      // The chat answer already reached the agent; an inbox row that cannot
      // take it (e.g. an answer outside the options) is closed instead.
      await this.deps.cancel
        .execute({
          appId: this.scope.appId,
          questionId,
          cancelledBy: BRIDGE_ACTOR,
          reason: 'Answered in chat',
        })
        .catch(() => undefined);
    }
  }

  private async readInboxAnswers(
    questionId: string,
    decision: Decision
  ): Promise<Record<string, string>> {
    const stored = await this.deps.questions.findById(this.scope.appId, questionId);
    if (stored?.responses) return answersByQuestionText(decision, stored.responses);
    // A pre-134 plain answer: give it to every question.
    const text = stored?.answer ?? '';
    return Object.fromEntries(decision.questions.map((q) => [q.question, text]));
  }
}
