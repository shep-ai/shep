/**
 * AgentQuestion Database Mapper
 *
 * Maps between AgentQuestion domain objects and SQLite rows for the
 * agent_questions table. Dates are stored as INTEGER unix milliseconds.
 */

import type {
  AgentQuestion,
  Decision,
  DecisionResponse,
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
} from '../../../../domain/generated/output.js';

export interface AgentQuestionRow {
  id: string;
  app_id: string;
  feature_id: string | null;
  agent_run_id: string;
  kind: string;
  prompt: string;
  options_json: string | null;
  default_answer: string | null;
  answerer: string;
  status: string;
  answer: string | null;
  answered_by: string | null;
  answered_at: number | null;
  expires_at: number | null;
  decision_json: string | null;
  responses_json: string | null;
  created_at: number;
  updated_at: number;
}

function toMillis(value: AgentQuestion['createdAt']): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime();
  return 0;
}

export function toDatabase(question: AgentQuestion): AgentQuestionRow {
  return {
    id: question.id,
    app_id: question.appId ?? '',
    feature_id: question.featureId ?? null,
    agent_run_id: question.agentRunId,
    kind: question.kind,
    prompt: question.prompt,
    options_json: question.optionsJson ?? null,
    default_answer: question.defaultAnswer ?? null,
    answerer: question.answerer,
    status: question.status,
    answer: question.answer ?? null,
    answered_by: question.answeredBy ?? null,
    answered_at: question.answeredAt ? toMillis(question.answeredAt) : null,
    expires_at: question.expiresAt ? toMillis(question.expiresAt) : null,
    decision_json: question.decision ? JSON.stringify(question.decision) : null,
    responses_json: question.responses ? JSON.stringify(question.responses) : null,
    created_at: toMillis(question.createdAt),
    updated_at: toMillis(question.updatedAt),
  };
}

export function fromDatabase(row: AgentQuestionRow): AgentQuestion {
  return {
    id: row.id,
    appId: row.app_id,
    featureId: row.feature_id ?? undefined,
    agentRunId: row.agent_run_id,
    kind: row.kind as AgentQuestionKind,
    prompt: row.prompt,
    optionsJson: row.options_json ?? undefined,
    defaultAnswer: row.default_answer ?? undefined,
    answerer: row.answerer as AgentQuestionAnswerer,
    status: row.status as AgentQuestionStatus,
    answer: row.answer ?? undefined,
    answeredBy: row.answered_by ?? undefined,
    answeredAt: row.answered_at ? new Date(row.answered_at) : undefined,
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    decision: parseDecision(row.decision_json),
    responses: parseJson<DecisionResponse[]>(row.responses_json),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  } as AgentQuestion;
}

/** A malformed JSON column reads as absent rather than failing the whole row. */
function parseJson<T>(value: string | null): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

/** JSON has no dates: `defaultAfter` is revived from its ISO string. */
function parseDecision(value: string | null): Decision | undefined {
  const decision = parseJson<Decision>(value);
  if (decision?.defaultAfter !== undefined) {
    decision.defaultAfter = new Date(decision.defaultAfter);
  }
  return decision;
}
