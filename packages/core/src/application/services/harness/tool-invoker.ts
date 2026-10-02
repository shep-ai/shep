/**
 * ToolInvoker (spec 119): one model tool call, end to end.
 *
 *   validate args (ajv) → describe effects → permission (persisted) →
 *   execute → raw output persisted as a chunk BEFORE any rendering → record
 *
 * Invalid arguments never reach the executor. A denial never executes. An
 * action that repeats one whose outcome is unknown (the process died while it
 * ran) is forced through `ask` instead of being blindly replayed.
 */
import { randomUUID } from 'node:crypto';
import {
  ChunkKind,
  HarnessEventType,
  HarnessTaskStatus,
  HarnessToolCallStatus,
  PermissionEffect,
  ToolReadWriteMode,
  type ContextChunk,
  type HarnessPermissionsConfig,
  type HarnessSession,
  type HarnessTask,
  type HarnessToolCall,
  type ToolImplementation,
} from '../../../domain/generated/output.js';
import { canonicalJson, sha256Hex } from '../../../domain/harness/fingerprints.js';
import type {
  HarnessToolCallRequest,
  IHarnessEventLog,
  IHarnessExecutionRepository,
  IPolicyEngine,
  IToolArgumentValidator,
  ToolExecutionContext,
} from '../../ports/output/harness/index.js';
import type { ActionDescriber } from './action-describer.js';
import { ChunkTag } from './candidate-retriever.js';
import type { CapabilityRegistry } from './capability-registry.js';
import type { ChunkWriter } from './chunk-writer.js';
import type { PermissionService } from './permission-service.js';

export const UNKNOWN_REPEAT_EFFECT = {
  category: 'unknown',
  description:
    'Repeats an action whose earlier outcome is unknown (the previous run was interrupted)',
};

export interface InvokeInput {
  session: HarnessSession;
  task: HarnessTask;
  turn: number;
  call: HarnessToolCallRequest;
  impl: ToolImplementation;
  intent?: string;
  ctx: ToolExecutionContext;
}

export interface InvokeOutcome {
  toolCall: HarnessToolCall;
  status: HarnessToolCallStatus;
  /** What was attempted (the described action), for the turn ledger. */
  action: string;
  /** Short line for the turn ledger / tool result message. */
  summary: string;
  chunk?: ContextChunk;
  rawOutput?: string;
  changedPaths?: string[];
}

export interface ToolInvokerDeps {
  registry: CapabilityRegistry;
  validator: IToolArgumentValidator;
  describer: ActionDescriber;
  permissions: PermissionService;
  policy: IPolicyEngine;
  execution: IHarnessExecutionRepository;
  writer: ChunkWriter;
  events: IHarnessEventLog;
  permissionsConfig: HarnessPermissionsConfig;
  interactive: boolean;
  /** `${implementationId}:${argumentsHash}` of side effects with unknown outcome. */
  unknownSideEffects: ReadonlySet<string>;
  setTaskStatus: (status: HarnessTaskStatus) => Promise<void>;
}

export class ToolInvoker {
  constructor(private readonly deps: ToolInvokerDeps) {}

  async invoke(input: InvokeInput): Promise<InvokeOutcome> {
    const { session, task, turn, call, impl } = input;
    const d = this.deps;
    const argumentsHash = sha256Hex(canonicalJson(call.args));
    const now = new Date();
    const toolCall: HarnessToolCall = {
      id: randomUUID(),
      taskId: task.id,
      turn,
      capabilityId: impl.capabilityId,
      implementationId: impl.id,
      arguments: call.args,
      argumentsHash,
      idempotencyKey: sha256Hex(`${task.id}:${turn}:${impl.id}:${argumentsHash}`),
      status: HarnessToolCallStatus.Pending,
      createdAt: now,
      updatedAt: now,
    };
    const save = async (patch: Partial<HarnessToolCall>) => {
      Object.assign(toolCall, patch, { updatedAt: new Date() });
      await d.execution.putToolCall(toolCall);
    };

    const validation = d.validator.validate(impl.inputSchema, call.args);
    if (!validation.valid) {
      const summary = `Invalid arguments for ${impl.toolName}: ${validation.errors.join('; ')}`;
      await save({ status: HarnessToolCallStatus.Invalid, summary });
      return { toolCall, status: toolCall.status, action: impl.toolName, summary };
    }

    const described = d.describer.describe(impl, call.args, {
      cwd: input.ctx.cwd,
      repoRoot: input.ctx.repoRoot,
      intent: input.intent,
      testCommand: input.ctx.testCommand,
    });
    if (
      impl.readWriteMode !== ToolReadWriteMode.Read &&
      d.unknownSideEffects.has(`${impl.id}:${argumentsHash}`)
    ) {
      described.effects.push(UNKNOWN_REPEAT_EFFECT);
    }
    await save({ status: HarnessToolCallStatus.Pending, summary: described.action.summary });
    await d.events.append({
      sessionId: session.id,
      taskId: task.id,
      type: HarnessEventType.ToolSelected,
      payload: {
        toolCallId: toolCall.id,
        capabilityId: impl.capabilityId,
        implementationId: impl.id,
        turn,
      },
    });

    let blocked = false;
    const permission = await d.permissions.evaluate({
      sessionId: session.id,
      taskId: task.id,
      toolCallId: toolCall.id,
      ...described,
      repoRoot: input.ctx.repoRoot,
      interactive: d.interactive,
      config: d.permissionsConfig,
      abortSignal: input.ctx.abortSignal,
      onPending: async () => {
        blocked = true;
        await d.setTaskStatus(HarnessTaskStatus.Blocked);
      },
    });
    if (blocked) await d.setTaskStatus(HarnessTaskStatus.Running);
    await save({ permissionDecisionId: permission.id });

    if (permission.result !== PermissionEffect.Allow) {
      const reason = permission.matchedRuleIds.length
        ? ((await d.policy.reasonFor(
            permission.matchedRuleIds.find((id) => id.startsWith('deny')) ??
              permission.matchedRuleIds[0],
            input.ctx.repoRoot
          )) ?? permission.matchedRuleIds.join(', '))
        : permission.reasonCode;
      const summary = `Denied: ${described.action.summary} — ${reason}${permission.reasonCode === 'approval_timeout' ? ' (no answer in time)' : ''}${permission.note ? `. Note from the user: ${permission.note}` : ''}`;
      await save({ status: HarnessToolCallStatus.Denied, summary });
      return { toolCall, status: toolCall.status, action: described.action.summary, summary };
    }

    await save({ status: HarnessToolCallStatus.Running, startedAt: new Date() });
    await d.events.append({
      sessionId: session.id,
      taskId: task.id,
      type: HarnessEventType.ToolExecutionStarted,
      payload: { toolCallId: toolCall.id, summary: described.action.summary },
    });
    const executor = d.registry.executor(impl.id);
    let ok = false;
    let output: string;
    let kind: ChunkKind = ChunkKind.ToolOutput;
    let label = described.action.summary;
    let path: string | undefined;
    let summary: string;
    let changedPaths: string[] | undefined;
    try {
      if (!executor) throw new Error(`No executor for ${impl.id}`);
      const result = await executor.execute(call.args, input.ctx);
      ok = result.ok;
      output = result.truncated
        ? `${result.output}\n[output truncated by the tool]`
        : result.output;
      kind = result.kind;
      label = result.label;
      path = result.path;
      summary = result.summary;
      changedPaths = result.changedPaths;
    } catch (error) {
      output = `Error: ${(error as Error).message}`;
      summary = `${impl.toolName} failed: ${(error as Error).message}`;
    }
    const chunk = await d.writer.write({
      sessionId: session.id,
      taskId: task.id,
      kind,
      label,
      source: toolCall.id,
      content: output,
      ...(path && { path }),
      tags: ok ? [] : [ChunkTag.Failed],
    });
    await save({
      status: ok ? HarnessToolCallStatus.Completed : HarnessToolCallStatus.Failed,
      rawOutputChunkId: chunk.id,
      summary,
      completedAt: new Date(),
    });
    await d.events.append({
      sessionId: session.id,
      taskId: task.id,
      type: HarnessEventType.ToolExecutionCompleted,
      payload: {
        toolCallId: toolCall.id,
        chunkId: chunk.id,
        ok,
        rawTokens: chunk.tokenEstimate,
        summary,
      },
    });
    return {
      toolCall,
      status: toolCall.status,
      action: described.action.summary,
      summary,
      chunk,
      rawOutput: output,
      ...(changedPaths && { changedPaths }),
    };
  }
}
