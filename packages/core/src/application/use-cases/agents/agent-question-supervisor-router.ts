/**
 * AgentQuestionSupervisorRouter
 *
 * Routes a freshly persisted {@link AgentQuestion} through the
 * supervisor pipeline (spec 093, task 31).
 *
 * Why this exists: the unified question pipeline (task 17) treats both
 * gate-emitted questions (task 20) and SDK V2 `AskUserQuestion`
 * questions identically. For non-gate questions we still want a
 * configured supervisor to evaluate the ask and — in autonomous mode —
 * answer it on the user's behalf. The router encapsulates the routing
 * rules so {@link AskAgentQuestionUseCase} stays small and so the
 * behaviour is unit-testable in isolation.
 *
 * Routing rules:
 *  - Skip when the question is gate-linked (`gateQuestionPublisher`
 *    will have raised a corresponding gate event already; routing the
 *    question too would double-evaluate).
 *  - Skip when `answerer === 'user'` — the user explicitly retains
 *    answer authority for these.
 *  - Resolve the effective {@link SupervisorPolicy} for the
 *    (appId, featureId) scope; if none is configured the call is a
 *    no-op (preserves NFR-14 default behaviour).
 *  - Evaluate the supervisor — the decision is always recorded so the
 *    audit / "Why?" drawer can show context even in advisory mode.
 *  - In **autonomous** mode AND when the verdict is `approve` /
 *    `reject`, settle the question via
 *    {@link AnswerAgentQuestionUseCase} with `actor =
 *    supervisor:<supervisorRunId>`. In **advisory** / **co-sign**
 *    modes the question stays pending — the user retains the final
 *    say (user always wins).
 *
 * Failures are swallowed: a supervisor outage MUST NOT prevent the
 * question from being persisted or answered later by the user.
 */

import { inject, injectable } from 'tsyringe';
import { randomUUID } from 'node:crypto';

import { AnswerAgentQuestionUseCase } from './answer-agent-question.use-case.js';
import { EvaluateSupervisorDecisionUseCase } from './evaluate-supervisor-decision.use-case.js';
import { GetSupervisorPolicyUseCase } from './get-supervisor-policy.use-case.js';
import {
  AgentQuestionAnswerer,
  SupervisorAutonomy,
  SupervisorVerdict,
  type AgentQuestion,
  type Decision,
  type DecisionResponse,
} from '../../../domain/generated/output.js';
import { isGateQuestion } from '../../../domain/shared/decision-builders.js';

const SUPERVISOR_QUESTION_PROMPT_PREFIX = 'gate.';
const APPROVE_ANSWER = 'approve';
const REJECT_ANSWER = 'reject';

export interface AgentQuestionSupervisorRouteResult {
  evaluated: boolean;
  /** Effective autonomy (only set when evaluated). */
  effectiveAutonomy?: SupervisorAutonomy;
  /** Supervisor's verdict (only set when evaluated). */
  verdict?: SupervisorVerdict;
  /** True when the supervisor answered the question in autonomous mode. */
  answered: boolean;
}

@injectable()
export class AgentQuestionSupervisorRouter {
  constructor(
    @inject(GetSupervisorPolicyUseCase)
    private readonly getPolicy: GetSupervisorPolicyUseCase,
    @inject(EvaluateSupervisorDecisionUseCase)
    private readonly evaluateDecision: EvaluateSupervisorDecisionUseCase,
    @inject(AnswerAgentQuestionUseCase)
    private readonly answerAgentQuestion: AnswerAgentQuestionUseCase
  ) {}

  /**
   * Route a freshly-persisted question through the supervisor.
   * Returns `{ evaluated: false, answered: false }` when the question is
   * skipped (user-only / no policy / failure).
   */
  async routeIfApplicable(question: AgentQuestion): Promise<AgentQuestionSupervisorRouteResult> {
    if (question.answerer === AgentQuestionAnswerer.user) {
      // User retains exclusive answer authority — never route to the
      // supervisor (acceptance criterion #3 for task 31).
      return { evaluated: false, answered: false };
    }

    if (isGateQuestion(question) || isGateLinkedPrompt(question.prompt)) {
      // Gate-emitted question: the worker already routes the
      // corresponding gate event through the supervisor, so routing
      // here would double-evaluate.
      return { evaluated: false, answered: false };
    }

    const scopeType = question.appId ? 'app' : question.repositoryId ? 'repo' : 'global';
    const scopeId = question.appId ?? question.repositoryId;

    try {
      const policy = await this.getPolicy.execute({
        scopeType,
        scopeId,
        featureId: question.featureId,
      });
      if (!policy) {
        return { evaluated: false, answered: false };
      }

      const supervisorRunId = randomUUID();
      const result = await this.evaluateDecision.execute({
        event: {
          kind: 'question',
          scopeType,
          scopeId,
          featureId: question.featureId,
          agentRunId: question.agentRunId,
          questionId: question.id,
          questionKind: question.kind,
          prompt: question.prompt,
          options: question.decision
            ? question.decision.questions.flatMap((q) => q.options.map((o) => o.label))
            : parseOptions(question.optionsJson),
          sourceEventId: question.id,
        },
        supervisorRunId,
      });

      if (!result.evaluated || !result.decision) {
        return { evaluated: false, answered: false };
      }

      const verdict = result.decision.verdict;
      const answered = await this.maybeAnswer(
        question,
        policy.autonomyLevel,
        verdict,
        supervisorRunId
      );

      return {
        evaluated: true,
        effectiveAutonomy: policy.autonomyLevel,
        verdict,
        answered,
      };
    } catch {
      // Audit-log / supervisor outages must never prevent the
      // user-driven path from continuing.
      return { evaluated: false, answered: false };
    }
  }

  private async maybeAnswer(
    question: AgentQuestion,
    autonomy: SupervisorAutonomy,
    verdict: SupervisorVerdict,
    supervisorRunId: string
  ): Promise<boolean> {
    if (autonomy !== SupervisorAutonomy.autonomous) return false;
    const answer = mapVerdictToAnswer(verdict);
    if (!answer) return false;

    // A decision is answered only by an option the verdict names — never by
    // the verdict word as typed text (spec 134).
    const responses = question.decision
      ? responsesForVerdict(question.decision, answer)
      : undefined;
    if (question.decision && !responses) return false;

    // Respect the question's option set when present — refuse to write
    // an answer that would fail validation in AnswerAgentQuestion.
    const options = parseOptions(question.optionsJson);
    if (!question.decision && options && !options.includes(answer)) return false;

    try {
      await this.answerAgentQuestion.execute({
        appId: question.appId ?? '',
        questionId: question.id,
        ...(responses ? { responses } : { answer }),
        answeredBy: `supervisor:${supervisorRunId}`,
      });
      return true;
    } catch {
      return false;
    }
  }
}

function parseOptions(optionsJson: string | undefined): string[] | undefined {
  if (!optionsJson) return undefined;
  try {
    const parsed = JSON.parse(optionsJson);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === 'string')) {
      return parsed as string[];
    }
  } catch {
    // Malformed JSON — treat as no options.
  }
  return undefined;
}

/** Select, in every question, the option whose id or label is the verdict word. */
function responsesForVerdict(decision: Decision, verdict: string): DecisionResponse[] | undefined {
  const responses: DecisionResponse[] = [];
  for (const q of decision.questions) {
    const option = q.options.find(
      (o) => o.id.toLowerCase() === verdict || o.label.trim().toLowerCase() === verdict
    );
    if (!option) return undefined;
    responses.push({ questionId: q.id, optionIds: [option.id] });
  }
  return responses;
}

function mapVerdictToAnswer(verdict: SupervisorVerdict): string | null {
  if (verdict === SupervisorVerdict.approve) return APPROVE_ANSWER;
  if (verdict === SupervisorVerdict.reject) return REJECT_ANSWER;
  return null;
}

function isGateLinkedPrompt(prompt: string): boolean {
  // The gate-question publisher (task 20) writes its prompt as a JSON
  // object containing event=waiting_approval. We use that as the
  // discriminator rather than introducing a column on the question
  // schema purely for routing.
  if (typeof prompt !== 'string') return false;
  const trimmed = prompt.trim();
  if (trimmed.startsWith(SUPERVISOR_QUESTION_PROMPT_PREFIX)) return true;
  if (!trimmed.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(trimmed) as { event?: unknown };
    return parsed?.event === 'waiting_approval';
  } catch {
    return false;
  }
}
