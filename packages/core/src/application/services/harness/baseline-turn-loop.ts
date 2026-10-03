/**
 * Baseline (transcript-first) turn loop (spec 119, ADR-010).
 *
 * The reference the query-aware loop is measured against: an append-only
 * message history, every builtin tool schema loaded on every turn, and raw
 * tool output appended (capped, with the cap recorded). Same model, same tool
 * executors, same permission engine — only context assembly differs.
 *
 * In shadow mode the query-aware ContextPlan is still computed and persisted
 * each turn (shadow=true) but never shown to the model.
 */
import { HarnessTaskOutcome, HarnessToolCallStatus } from '../../../domain/generated/output.js';
import { estimateTokens } from '../../../domain/harness/fingerprints.js';
import type { HarnessModelMessage, HarnessToolSpec } from '../../ports/output/harness/index.js';
import { failureResult, resultFromCompleteTask } from './completion.js';
import { callModel } from './model-call-recorder.js';
import { COMPLETE_TASK_TOOL, MetaTool } from './meta-tools.js';
import type { LoopOutcome, TurnContext } from './turn-context.js';
import { beforeTurn } from './turn-guard.js';

/** Per-output cap in the baseline transcript (recorded when applied). */
export const BASELINE_OUTPUT_CAP_CHARS = 30_000;

export async function runBaselineLoop(tc: TurnContext): Promise<LoopOutcome> {
  const produced: string[] = [];
  const tools: HarnessToolSpec[] = [
    COMPLETE_TASK_TOOL,
    ...tc.registry
      .list()
      .flatMap((c) =>
        tc.registry
          .implementations(c.id)
          .map((i) => ({ name: i.toolName, description: i.snippet, inputSchema: i.inputSchema }))
      ),
  ];
  const messages: HarnessModelMessage[] = [{ role: 'user', content: tc.prompt }];
  let lastText = '';
  for (let turn = 1; turn <= tc.maxTurns; turn++) {
    const stop = await beforeTurn(tc);
    if (stop) return { result: failureResult(stop, produced), finalText: stop };
    if (tc.shadowContext) {
      await tc.engine.build({
        sessionId: tc.session.id,
        task: tc.task,
        turn,
        query: turn === 1 ? tc.goal : `${lastText}\n${tc.goal}`,
        ...(tc.repoSnapshotId && { repoSnapshotId: tc.repoSnapshotId }),
        config: tc.config.context,
        fixedTokens: estimateTokens(tc.system),
        promptSectionChunkIds: tc.promptSectionChunkIds,
        escalations: new Map(),
        userIncludes: new Set(),
        instructionIds: tc.instructionIds,
        capabilityIds: tc.registry.list().map((c) => c.id),
        loadedSchemaIds: [],
        shadow: true,
      });
    }
    const response = await callModel(tc, turn, {
      system: tc.system,
      messages,
      tools,
      abortSignal: tc.abortSignal,
    });
    tc.task.turnCount = turn;
    lastText = response.text || lastText;
    messages.push({ role: 'assistant', content: response.text, toolCalls: response.toolCalls });
    if (response.toolCalls.length === 0) {
      const summary = response.text.trim() || 'Finished without a summary.';
      return {
        result: {
          status: HarnessTaskOutcome.Success,
          summary,
          evidence: [],
          producedChunkIds: produced,
        },
        finalText: summary,
      };
    }
    for (const call of response.toolCalls) {
      if (call.name === MetaTool.CompleteTask) {
        const result = resultFromCompleteTask(call.args, produced, tc.repoSnapshotId);
        return { result, finalText: result.summary };
      }
      const impl = tc.registry.byToolName(call.name);
      if (!impl) {
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          toolName: call.name,
          content: `Unknown tool ${call.name}`,
        });
        continue;
      }
      tc.progress({ kind: 'tool', message: `turn ${turn}: ${call.name}` });
      const outcome = await tc.invoker.invoke({
        session: tc.session,
        task: tc.task,
        turn,
        call,
        impl,
        ctx: tc.toolCtx,
      });
      if (outcome.chunk) produced.push(outcome.chunk.id);
      let content = outcome.rawOutput ?? outcome.summary;
      if (
        outcome.status === HarnessToolCallStatus.Denied ||
        outcome.status === HarnessToolCallStatus.Invalid
      ) {
        content = outcome.summary;
      } else if (content.length > BASELINE_OUTPUT_CAP_CHARS) {
        content = `${content.slice(0, BASELINE_OUTPUT_CAP_CHARS)}\n[truncated: ${content.length - BASELINE_OUTPUT_CAP_CHARS} more characters]`;
      }
      messages.push({ role: 'tool', toolCallId: call.id, toolName: call.name, content });
    }
  }
  const summary = `Stopped after reaching the turn limit (${tc.maxTurns}) without completing.`;
  return { result: failureResult(summary, produced), finalText: summary };
}
