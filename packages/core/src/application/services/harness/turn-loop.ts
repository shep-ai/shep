/**
 * Query-aware turn loop (spec 119, plan "One Query-Aware Turn").
 *
 * Every turn: build and persist a ContextPlan → one model call with only the
 * meta-tools plus the implementations loaded so far → handle each tool call.
 * There is no transcript: the next turn's context comes from state (chunks,
 * the ledger, escalations), never from replaying earlier messages.
 */
import {
  ChunkVisibility,
  HarnessEventType,
  HarnessTaskOutcome,
  HarnessToolCallStatus,
  type ToolImplementation,
} from '../../../domain/generated/output.js';
import { estimateTokens } from '../../../domain/harness/fingerprints.js';
import { escalateVisibility } from '../../../domain/harness/visibility-ladder.js';
import type { HarnessToolCallRequest, HarnessToolSpec } from '../../ports/output/harness/index.js';
import { failureResult, resultFromCompleteTask } from './completion.js';
import { callModel } from './model-call-recorder.js';
import { MetaTool, QUERY_AWARE_META_TOOLS } from './meta-tools.js';
import type { LoopOutcome, TurnContext } from './turn-context.js';
import { beforeTurn } from './turn-guard.js';

const ACT_NOW =
  'Decide the next step. Use loaded tools directly, load more with use_capability, ask for detail with expand_chunk, or call complete_task when done.';

function loadedTools(tc: TurnContext): HarnessToolSpec[] {
  return [...tc.loadedImplementationIds]
    .map((id) => tc.registry.executor(id)?.implementation)
    .filter((i) => i !== undefined)
    .map((i) => ({ name: i.toolName, description: i.snippet, inputSchema: i.inputSchema }));
}

async function invokeLoaded(
  tc: TurnContext,
  turn: number,
  call: HarnessToolCallRequest,
  impl: ToolImplementation,
  intent: string,
  produced: string[],
  focus: string[]
): Promise<void> {
  tc.progress({ kind: 'tool', message: `turn ${turn}: ${call.name}` });
  const outcome = await tc.invoker.invoke({
    session: tc.session,
    task: tc.task,
    turn,
    call,
    impl,
    intent: intent.slice(0, 300) || undefined,
    ctx: tc.toolCtx,
  });
  if (outcome.chunk) produced.push(outcome.chunk.id);
  if (outcome.status === HarnessToolCallStatus.Denied) {
    tc.progress({ kind: 'permission', message: outcome.summary });
  }
  tc.ledger.add({
    turn,
    action: outcome.action,
    outcome: outcome.summary,
    ...(outcome.chunk && { chunkId: outcome.chunk.id }),
  });
  focus.push(outcome.summary);
}

export async function runQueryAwareLoop(tc: TurnContext): Promise<LoopOutcome> {
  const produced: string[] = [];
  let lastText = '';
  let lastFocus = '';
  for (let turn = 1; turn <= tc.maxTurns; turn++) {
    const stop = await beforeTurn(tc);
    if (stop) return { result: failureResult(stop, produced), finalText: stop };
    const tools = [...QUERY_AWARE_META_TOOLS, ...loadedTools(tc)];
    const ledger = tc.ledger.render();
    const fixedTokens =
      estimateTokens(tc.system) + estimateTokens(JSON.stringify(tools)) + estimateTokens(ledger);
    const query = turn === 1 ? tc.goal : `${lastFocus}\n${tc.goal}`.trim();
    const { plan, text } = await tc.engine.build({
      sessionId: tc.session.id,
      task: tc.task,
      turn,
      query,
      ...(tc.repoSnapshotId && { repoSnapshotId: tc.repoSnapshotId }),
      config: tc.config.context,
      fixedTokens,
      promptSectionChunkIds: tc.promptSectionChunkIds,
      escalations: tc.escalations,
      userIncludes: tc.userIncludes,
      instructionIds: tc.instructionIds,
      capabilityIds: tc.registry.list().map((c) => c.id),
      loadedSchemaIds: [...tc.loadedImplementationIds],
      prefixTokens: estimateTokens(tc.system),
      shadow: false,
    });
    tc.progress({
      kind: 'plan',
      message: `turn ${turn}: context ${plan.estimatedTokens} tokens, ${plan.chunks.filter((c) => c.visibility !== ChunkVisibility.Hidden).length}/${plan.candidateCount} chunks shown`,
    });
    const user = `<ledger>\n${ledger}\n</ledger>\n\n<context>\n${text}\n</context>\n\n${ACT_NOW}`;
    const response = await callModel(
      tc,
      turn,
      {
        system: tc.system,
        messages: [{ role: 'user', content: user }],
        tools,
        abortSignal: tc.abortSignal,
      },
      plan.id
    );
    tc.task.turnCount = turn;
    lastText = response.text || lastText;
    if (response.toolCalls.length === 0) {
      // A plain answer without complete_task is taken as the final result.
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
    const focus: string[] = [response.text];
    for (const call of response.toolCalls) {
      if (call.name === MetaTool.CompleteTask) {
        const result = resultFromCompleteTask(call.args, produced, tc.repoSnapshotId);
        return { result, finalText: result.summary };
      }
      if (call.name === MetaTool.ExpandChunk) {
        const chunkId = String(call.args.chunkId ?? '');
        const chunk = chunkId ? await tc.context.getChunk(chunkId) : null;
        if (!chunk) {
          tc.ledger.add({ turn, action: `expand_chunk ${chunkId}`, outcome: 'unknown chunk id' });
          continue;
        }
        const current = tc.escalations.get(chunkId);
        const requested = call.args.level as ChunkVisibility | undefined;
        const level = requested ?? escalateVisibility(current ?? ChunkVisibility.Short);
        tc.escalations.set(chunkId, level);
        await tc.events.append({
          sessionId: tc.session.id,
          taskId: tc.task.id,
          type: HarnessEventType.ChunkExpanded,
          payload: { chunkId, level, turn },
        });
        tc.ledger.add({
          turn,
          action: `expand_chunk ${chunk.label}`,
          outcome: `will be shown ${level} next turn`,
          chunkId,
        });
        focus.push(chunk.label);
        continue;
      }
      if (call.name === MetaTool.UseCapability) {
        const intent = String(call.args.intent ?? '');
        try {
          const plan = await tc.router.resolve(
            {
              description: intent,
              ...(typeof call.args.capabilityId === 'string' && {
                capabilityId: call.args.capabilityId,
              }),
              taskType: tc.task.type,
            },
            { sessionId: tc.session.id, taskId: tc.task.id, shadow: false }
          );
          tc.loadedImplementationIds.add(plan.implementation.id);
          const docs =
            call.args.withDocs === true ? tc.registry.docsFor(plan.implementation.id) : undefined;
          tc.ledger.add({
            turn,
            action: `use_capability ${plan.capabilityId}`,
            outcome: `loaded tool ${plan.implementation.toolName}${docs ? ` (docs: ${docs})` : ''}`,
          });
          const args = call.args.args;
          if (args && typeof args === 'object' && !Array.isArray(args)) {
            // Load and call in one turn: the schema is validated as usual.
            const direct = {
              id: call.id,
              name: plan.implementation.toolName,
              args: args as Record<string, unknown>,
            };
            await invokeLoaded(tc, turn, direct, plan.implementation, intent, produced, focus);
          }
        } catch (error) {
          tc.ledger.add({
            turn,
            action: `use_capability ${String(call.args.capabilityId ?? intent)}`,
            outcome: (error as Error).message,
          });
        }
        focus.push(intent);
        continue;
      }
      const impl = tc.registry.byToolName(call.name);
      if (!impl || !tc.loadedImplementationIds.has(impl.id)) {
        tc.ledger.add({
          turn,
          action: call.name,
          outcome: 'not loaded — call use_capability first',
        });
        continue;
      }
      await invokeLoaded(tc, turn, call, impl, response.text, produced, focus);
    }
    lastFocus = focus.filter(Boolean).join('\n').slice(0, 2000);
  }
  const summary = `Stopped after reaching the turn limit (${tc.maxTurns}) without completing.${lastText ? ` Last message: ${lastText.slice(0, 500)}` : ''}`;
  return { result: failureResult(summary, produced), finalText: summary };
}
