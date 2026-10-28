/**
 * Reading an incoming A2A message (spec 149): its text, its data parts merged
 * into one object, the task it continues, and what it asks shep to do.
 */

import { FeatureConsoleAction } from '../../../domain/generated/output.js';
import { A2aError, isRecord } from './a2a-json-rpc.js';
import { A2aErrorCode } from './a2a.types.js';

/** Data-part and metadata keys shep reads. */
const REPOSITORY_PATH_KEY = 'repositoryPath';
const DECISION_KEY = 'decision';
const FEEDBACK_KEY = 'feedback';

const DECISIONS: ReadonlySet<string> = new Set([
  FeatureConsoleAction.Approve,
  FeatureConsoleAction.Reject,
]);

export interface IncomingMessage {
  /** The text parts, joined by blank lines. */
  text: string;
  /** Every data part's object, merged; later parts win. */
  data: Record<string, unknown>;
  taskId?: string;
  /** Message metadata, then request metadata. */
  metadata: Record<string, unknown>;
}

/** What a message on an existing task asks for. */
export type TaskReply =
  | { kind: 'decision'; action: FeatureConsoleAction; feedback?: string }
  | { kind: 'answer'; answer: string };

export function readMessage(params: Record<string, unknown>): IncomingMessage {
  const message = params.message;
  if (!isRecord(message) || !Array.isArray(message.parts) || message.parts.length === 0) {
    throw new A2aError(A2aErrorCode.InvalidParams, 'message with at least one part is required.');
  }
  const texts: string[] = [];
  const data: Record<string, unknown> = {};
  for (const part of message.parts) {
    if (!isRecord(part)) continue;
    if (typeof part.text === 'string') texts.push(part.text);
    if (isRecord(part.data)) Object.assign(data, part.data);
  }
  return {
    text: texts.join('\n\n').trim(),
    data,
    ...(typeof message.taskId === 'string' && message.taskId ? { taskId: message.taskId } : {}),
    metadata: {
      ...(isRecord(params.metadata) ? params.metadata : {}),
      ...(isRecord(message.metadata) ? message.metadata : {}),
    },
  };
}

/** The repository a new task should run in: a data part first, then metadata. */
export function repositoryPathOf(message: IncomingMessage): string | undefined {
  const value = message.data[REPOSITORY_PATH_KEY] ?? message.metadata[REPOSITORY_PATH_KEY];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** A gate decision when a data part names one; otherwise the text as an answer. */
export function replyOf(message: IncomingMessage): TaskReply {
  const decision = message.data[DECISION_KEY];
  if (decision !== undefined) {
    if (typeof decision !== 'string' || !DECISIONS.has(decision)) {
      throw new A2aError(
        A2aErrorCode.InvalidParams,
        `decision must be "${FeatureConsoleAction.Approve}" or "${FeatureConsoleAction.Reject}".`
      );
    }
    const feedback = message.data[FEEDBACK_KEY];
    return {
      kind: 'decision',
      action: decision as FeatureConsoleAction,
      ...(typeof feedback === 'string' && feedback ? { feedback } : {}),
    };
  }
  if (!message.text) {
    throw new A2aError(A2aErrorCode.InvalidParams, 'Send text to answer, or a decision data part.');
  }
  return { kind: 'answer', answer: message.text };
}
