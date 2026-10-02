/**
 * Records one model call (spec 119): a ModelCall row before the request,
 * provider-reported usage after it, and the response as a chunk.
 */
import { randomUUID } from 'node:crypto';
import {
  ChunkKind,
  HarnessEventType,
  ModelCallStatus,
  type ModelCall,
} from '../../../domain/generated/output.js';
import { canonicalJson, estimateTokens } from '../../../domain/harness/fingerprints.js';
import type {
  HarnessModelRequest,
  HarnessModelResponse,
} from '../../ports/output/harness/index.js';
import type { TurnContext } from './turn-context.js';

export async function callModel(
  tc: TurnContext,
  turn: number,
  request: HarnessModelRequest,
  contextPlanId?: string
): Promise<HarnessModelResponse> {
  const estimated =
    estimateTokens(request.system) +
    estimateTokens(canonicalJson(request.messages)) +
    estimateTokens(canonicalJson(request.tools));
  const call: ModelCall = {
    id: randomUUID(),
    taskId: tc.task.id,
    turn,
    modelId: tc.model.modelId,
    ...(contextPlanId && { contextPlanId }),
    status: ModelCallStatus.Running,
    estimatedInputTokens: estimated,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await tc.execution.putModelCall(call);
  await tc.events.append({
    sessionId: tc.session.id,
    taskId: tc.task.id,
    type: HarnessEventType.ModelCallStarted,
    payload: {
      modelCallId: call.id,
      turn,
      contextPlanId: contextPlanId ?? null,
      estimatedInputTokens: estimated,
    },
  });
  let response: HarnessModelResponse;
  try {
    response = await tc.model.complete(request);
  } catch (error) {
    await tc.execution.putModelCall({
      ...call,
      status: ModelCallStatus.Failed,
      error: (error as Error).message,
      updatedAt: new Date(),
    });
    throw error;
  }
  const responseChunk = await tc.writer.write({
    sessionId: tc.session.id,
    taskId: tc.task.id,
    kind: ChunkKind.AssistantMessage,
    label: `turn ${turn} response`,
    source: call.id,
    content: canonicalJson({ text: response.text, toolCalls: response.toolCalls }),
  });
  const u = response.usage;
  await tc.execution.putModelCall({
    ...call,
    status: ModelCallStatus.Completed,
    ...(u.inputTokens !== undefined && { inputTokens: u.inputTokens }),
    ...(u.outputTokens !== undefined && { outputTokens: u.outputTokens }),
    ...(u.cachedInputTokens !== undefined && { cachedInputTokens: u.cachedInputTokens }),
    ...(u.costUsd !== undefined && { costUsd: u.costUsd }),
    latencyMs: response.latencyMs,
    responseChunkId: responseChunk.id,
    finishReason: response.finishReason,
    updatedAt: new Date(),
  });
  tc.usage.inputTokens += u.inputTokens ?? estimated;
  tc.usage.outputTokens += u.outputTokens ?? 0;
  tc.usage.cachedInputTokens += u.cachedInputTokens ?? 0;
  tc.usage.costUsd =
    tc.usage.costUsd !== undefined && u.costUsd !== undefined
      ? tc.usage.costUsd + u.costUsd
      : undefined;
  tc.usage.turns += 1;
  tc.usage.apiLatencyMs += response.latencyMs;
  await tc.events.append({
    sessionId: tc.session.id,
    taskId: tc.task.id,
    type: HarnessEventType.ModelCallCompleted,
    payload: {
      modelCallId: call.id,
      turn,
      inputTokens: u.inputTokens ?? null,
      outputTokens: u.outputTokens ?? null,
      cachedInputTokens: u.cachedInputTokens ?? null,
      toolCalls: response.toolCalls.map((c) => c.name),
    },
  });
  return response;
}
