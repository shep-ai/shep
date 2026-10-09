/**
 * Decision builders (spec 134).
 *
 * Every producer of an "agent asks, user picks" moment converts its own shape
 * into one {@link Decision} here, so renderers only ever see one model:
 *  - chat `AskUserQuestion` (Claude / Cursor) → {@link decisionFromUserQuestions}
 *  - the PRD questionnaire → {@link decisionFromPrdQuestionnaire}
 *  - feature-agent approval gates → {@link buildApprovalGateDecision}
 *  - rows written before spec 134 → {@link decisionForQuestion}
 *
 * Pure; extensionless imports (consumed by the web bundle as raw source).
 */

import {
  AgentQuestionStatus,
  DecisionKind,
  DecisionResponseMode,
  type AgentQuestion,
  type Decision,
  type DecisionResponse,
  type PrdQuestionnaireData,
} from '../generated/output';

/** Structural copy of the executor port's `UserQuestion` (domain cannot import application). */
export interface UserQuestionShape {
  question: string;
  header: string;
  options: { label: string; description: string; preview?: string }[];
  multiSelect: boolean;
}

/** Question id used by approval-gate decisions. */
export const GATE_QUESTION_ID = 'gate';
/** Option id that approves a gate. */
export const GATE_APPROVE_OPTION_ID = 'approve';
/** Option id that rejects a gate. */
export const GATE_REJECT_OPTION_ID = 'reject';

/** Event marker the pre-134 gate publisher wrote into the prompt as JSON. */
const LEGACY_GATE_EVENT = 'waiting_approval';

/** What each graph node's gate is asking about, in words. */
const GATE_TITLES: Readonly<Record<string, string>> = {
  requirements: 'Requirements are ready for review',
  research: 'The technical research is ready for review',
  plan: 'The implementation plan is ready for review',
  merge: 'The pull request is ready to merge',
};

function gateTitle(node: string | undefined): string {
  if (!node) return 'A step is waiting for your approval';
  return GATE_TITLES[node] ?? `The ${node} step is waiting for your approval`;
}

/** A chat `AskUserQuestion` call as a Decision (option ids `o1…`, question ids `q1…`). */
export function decisionFromUserQuestions(
  id: string,
  questions: UserQuestionShape[],
  responseMode: DecisionResponseMode
): Decision {
  return {
    id,
    kind: DecisionKind.ChatQuestion,
    responseMode,
    questions: questions.map((q, qi) => ({
      id: `q${qi + 1}`,
      header: q.header,
      question: q.question,
      multiSelect: q.multiSelect,
      // AskUserQuestion always offers "Other".
      allowCustom: true,
      options: q.options.map((o, oi) => ({
        id: `o${oi + 1}`,
        label: o.label,
        description: o.description,
        ...(o.preview ? { preview: o.preview } : {}),
      })),
    })),
  };
}

/** The PRD questionnaire as a Decision (ids preserved; rationale becomes the description). */
export function decisionFromPrdQuestionnaire(id: string, data: PrdQuestionnaireData): Decision {
  return {
    id,
    kind: DecisionKind.PrdQuestionnaire,
    responseMode: DecisionResponseMode.Async,
    title: data.question,
    questions: data.questions.map((q) => ({
      id: q.id,
      header: q.question,
      question: q.question,
      multiSelect: false,
      allowCustom: false,
      options: q.options.map((o) => ({
        id: o.id,
        label: o.label,
        description: o.rationale,
        ...(o.recommended ? { recommended: true } : {}),
      })),
    })),
  };
}

/**
 * An approval gate as a Decision: Approve (recommended) or Reject, and a typed
 * note — which rejects with that note as feedback.
 */
export function buildApprovalGateDecision(id: string, node: string | undefined): Decision {
  const title = gateTitle(node);
  return {
    id,
    kind: DecisionKind.ApprovalGate,
    responseMode: DecisionResponseMode.Async,
    title,
    questions: [
      {
        id: GATE_QUESTION_ID,
        header: 'Approval',
        question: `${title}. Approve it, or reject it with feedback?`,
        multiSelect: false,
        allowCustom: true,
        options: [
          {
            id: GATE_APPROVE_OPTION_ID,
            label: 'Approve',
            description: 'Continue to the next step',
            recommended: true,
          },
          {
            id: GATE_REJECT_OPTION_ID,
            label: 'Reject',
            description: 'Send it back; type feedback to say what to change',
          },
        ],
      },
    ],
  };
}

export interface GateVerdict {
  verdict: 'approve' | 'reject';
  /** Present when the user typed a note instead of picking an option. */
  feedback?: string;
}

/** Read a gate verdict from responses; undefined when they do not answer a gate. */
export function gateVerdictFromResponses(responses: DecisionResponse[]): GateVerdict | undefined {
  const response = responses.find((r) => r.questionId === GATE_QUESTION_ID);
  if (!response) return undefined;
  const feedback = response.customText?.trim() ?? '';
  if (feedback.length > 0) return { verdict: 'reject', feedback };
  if (response.optionIds.includes(GATE_APPROVE_OPTION_ID)) return { verdict: 'approve' };
  if (response.optionIds.includes(GATE_REJECT_OPTION_ID)) return { verdict: 'reject' };
  return undefined;
}

/**
 * A pre-134 question with plain string options. Each string is both id and
 * label, so answers recorded before spec 134 still match an option.
 */
export function decisionFromLegacyOptions(id: string, prompt: string, options: string[]): Decision {
  return {
    id,
    kind: DecisionKind.Legacy,
    responseMode: DecisionResponseMode.Async,
    questions: [
      {
        id: 'q1',
        header: 'Question',
        question: prompt,
        multiSelect: false,
        allowCustom: options.length === 0,
        options: options.map((o) => ({ id: o, label: o, description: '' })),
      },
    ],
  };
}

function parseLegacyOptions(optionsJson: string | undefined): string[] {
  if (!optionsJson) return [];
  try {
    const parsed: unknown = JSON.parse(optionsJson);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function parseLegacyGatePrompt(prompt: string): { node?: string } | undefined {
  try {
    const parsed: unknown = JSON.parse(prompt);
    if (parsed && typeof parsed === 'object' && 'event' in parsed) {
      const record = parsed as { event?: unknown; node?: unknown };
      if (record.event === LEGACY_GATE_EVENT) {
        return { node: typeof record.node === 'string' ? record.node : undefined };
      }
    }
  } catch {
    // A plain-text prompt.
  }
  return undefined;
}

/** True for a question that stands for an approval gate, old or new. */
export function isGateQuestion(question: Pick<AgentQuestion, 'decision' | 'prompt'>): boolean {
  if (question.decision) return question.decision.kind === DecisionKind.ApprovalGate;
  return parseLegacyGatePrompt(question.prompt) !== undefined;
}

/**
 * The Decision every surface renders for a stored question: the stored one, or
 * one rebuilt from a pre-134 row. A cancelled question cannot be answered.
 */
export function decisionForQuestion(question: AgentQuestion): Decision {
  const legacyGate = question.decision ? undefined : parseLegacyGatePrompt(question.prompt);
  const decision =
    question.decision ??
    (legacyGate
      ? buildApprovalGateDecision(question.id, legacyGate.node)
      : decisionFromLegacyOptions(
          question.id,
          question.prompt,
          parseLegacyOptions(question.optionsJson)
        ));
  if (question.status === AgentQuestionStatus.cancelled) {
    return { ...decision, responseMode: DecisionResponseMode.NotResumable };
  }
  return decision;
}
