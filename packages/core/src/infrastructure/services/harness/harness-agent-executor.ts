/**
 * HarnessAgentExecutor (spec 119): the `shep-harness` agent type.
 *
 * A thin IAgentExecutor adapter over HarnessTaskService, so the feature agent,
 * the agent picker and every other executor consumer run the harness exactly
 * like any other agent. Each call is one harness task; calls from the same
 * AgentRun share one harness session.
 */
import { AgentFeature, AgentType, type AgentConfig } from '../../../domain/generated/output.js';
import type {
  AgentExecutionOptions,
  AgentExecutionResult,
  AgentExecutionStreamEvent,
  IAgentExecutor,
} from '../../../application/ports/output/agents/agent-executor.interface.js';
import type {
  ExecuteHarnessTaskInput,
  ExecuteHarnessTaskResult,
  HarnessTaskService,
} from '../../../application/services/harness/harness-task-service.js';
import type { ProgressEvent } from '../../../application/services/harness/turn-context.js';

const SUPPORTED_FEATURES: ReadonlySet<AgentFeature> = new Set([
  AgentFeature.streaming,
  AgentFeature.structuredOutput,
  AgentFeature.systemPrompt,
  AgentFeature.sessionResume,
]);

export class HarnessAgentExecutor implements IAgentExecutor {
  readonly agentType = AgentType.ShepHarness;

  constructor(
    private readonly service: () => HarnessTaskService,
    private readonly authConfig: AgentConfig
  ) {}

  supportsFeature(feature: AgentFeature): boolean {
    return SUPPORTED_FEATURES.has(feature);
  }

  private input(
    prompt: string,
    options: AgentExecutionOptions | undefined,
    onProgress?: (e: ProgressEvent) => void
  ): ExecuteHarnessTaskInput {
    const token = this.authConfig.token?.trim();
    const ctx = options?.callContext;
    return {
      prompt,
      cwd: options?.cwd ?? process.cwd(),
      ...(ctx?.agentRunId && { agentRunId: ctx.agentRunId }),
      ...(ctx?.featureId && { featureId: ctx.featureId }),
      ...(ctx?.phase && { phase: ctx.phase }),
      ...(!ctx?.agentRunId && options?.resumeSession && { sessionId: options.resumeSession }),
      ...(options?.systemPrompt && { systemPrompt: options.systemPrompt }),
      ...(options?.promptSections && { promptSections: options.promptSections }),
      ...(options?.outputSchema && { outputSchema: options.outputSchema }),
      ...(options?.model && { modelId: options.model }),
      ...(token && { credential: token }),
      // Feature runs are answered from the web UI or `shep harness permissions`.
      interactive: true,
      ...(options?.timeout && { timeoutMs: options.timeout }),
      ...(options?.abortSignal && { abortSignal: options.abortSignal }),
      ...(onProgress && { onProgress }),
    };
  }

  private toResult(run: ExecuteHarnessTaskResult): AgentExecutionResult {
    return {
      result: run.text,
      sessionId: run.session.id,
      usage: {
        inputTokens: run.usage.inputTokens,
        outputTokens: run.usage.outputTokens,
        cacheReadInputTokens: run.usage.cachedInputTokens,
        ...(run.usage.costUsd !== undefined && { costUsd: run.usage.costUsd }),
        numTurns: run.usage.turns,
        durationApiMs: run.usage.apiLatencyMs,
      },
      metadata: {
        harnessSessionId: run.session.id,
        harnessTaskId: run.task.id,
        harnessOutcome: run.result.status,
        ...(run.structured !== undefined && { structured_output: run.structured }),
      },
    };
  }

  async execute(prompt: string, options?: AgentExecutionOptions): Promise<AgentExecutionResult> {
    return this.toResult(await this.service().execute(this.input(prompt, options)));
  }

  async *executeStream(
    prompt: string,
    options?: AgentExecutionOptions
  ): AsyncIterable<AgentExecutionStreamEvent> {
    const queue: AgentExecutionStreamEvent[] = [];
    let wake: (() => void) | undefined;
    const push = (event: AgentExecutionStreamEvent) => {
      queue.push(event);
      wake?.();
    };
    let done = false;
    let failure: unknown;
    let final: ExecuteHarnessTaskResult | undefined;
    const running = this.service()
      .execute(
        this.input(prompt, options, (e) =>
          push({ type: 'progress', content: e.message, timestamp: new Date() })
        )
      )
      .then((r) => {
        final = r;
      })
      .catch((error: unknown) => {
        failure = error;
      })
      .finally(() => {
        done = true;
        wake?.();
      });

    while (!done || queue.length > 0) {
      const next = queue.shift();
      if (next) {
        yield next;
        continue;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
      wake = undefined;
    }
    await running;
    if (failure) throw failure;
    yield {
      type: 'result',
      content: final!.text,
      timestamp: new Date(),
      sessionId: final!.session.id,
    };
  }
}
