/**
 * Pure aggregation of harness usage (spec 119): per-task and per-session
 * totals used by the CLI, the web session page and the eval report.
 */
import {
  ChunkKind,
  ChunkVisibility,
  HarnessToolCallStatus,
  type ContextPlan,
  type HarnessToolCall,
  type ModelCall,
} from '../../../domain/generated/output.js';

export interface HarnessUsageSummary {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  /** undefined when any call reported no cost: never summed as zero. */
  costUsd: number | undefined;
  toolCalls: number;
  deniedToolCalls: number;
  /** Tokens of tool output the model actually saw vs. the raw output size. */
  visibleToolTokens: number;
  rawToolTokens: number;
  /** Context tokens per call against the plan budget (latest plan). */
  lastPlanTokens?: number;
  lastPlanBudget?: number;
  visibilityHistogram: Record<ChunkVisibility, number>;
}

const TOOL_OUTPUT_KINDS: ReadonlySet<ChunkKind> = new Set([
  ChunkKind.ToolOutput,
  ChunkKind.CommandOutput,
  ChunkKind.SearchResult,
  ChunkKind.TestResult,
  ChunkKind.Diff,
  ChunkKind.File,
  ChunkKind.FileExcerpt,
]);

export function emptyHistogram(): Record<ChunkVisibility, number> {
  return {
    [ChunkVisibility.Hidden]: 0,
    [ChunkVisibility.Short]: 0,
    [ChunkVisibility.Long]: 0,
    [ChunkVisibility.Full]: 0,
  };
}

export function planHistogram(plan: Pick<ContextPlan, 'chunks'>): Record<ChunkVisibility, number> {
  const histogram = emptyHistogram();
  for (const c of plan.chunks) histogram[c.visibility] += 1;
  return histogram;
}

export function summarizeUsage(
  modelCalls: readonly ModelCall[],
  toolCalls: readonly HarnessToolCall[],
  plans: readonly ContextPlan[]
): HarnessUsageSummary {
  let costUsd: number | undefined = 0;
  const summary: HarnessUsageSummary = {
    turns: modelCalls.length,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    costUsd: undefined,
    toolCalls: toolCalls.length,
    deniedToolCalls: toolCalls.filter((t) => t.status === HarnessToolCallStatus.Denied).length,
    visibleToolTokens: 0,
    rawToolTokens: 0,
    visibilityHistogram: emptyHistogram(),
  };
  for (const call of modelCalls) {
    summary.inputTokens += call.inputTokens ?? 0;
    summary.outputTokens += call.outputTokens ?? 0;
    summary.cachedInputTokens += call.cachedInputTokens ?? 0;
    costUsd =
      costUsd !== undefined && call.costUsd !== undefined ? costUsd + call.costUsd : undefined;
  }
  summary.costUsd = modelCalls.length > 0 ? costUsd : undefined;
  const enforced = plans.filter((p) => !p.shadow);
  for (const plan of enforced) {
    for (const c of plan.chunks) {
      if (!TOOL_OUTPUT_KINDS.has(c.kind)) continue;
      summary.visibleToolTokens += c.tokens;
      summary.rawToolTokens += c.rawTokens;
    }
  }
  const last = enforced.at(-1) ?? plans.at(-1);
  if (last) {
    summary.lastPlanTokens = last.estimatedTokens;
    summary.lastPlanBudget = last.tokenBudget;
    summary.visibilityHistogram = planHistogram(last);
  }
  return summary;
}

export function addSummaries(a: HarnessUsageSummary, b: HarnessUsageSummary): HarnessUsageSummary {
  const histogram = emptyHistogram();
  for (const v of Object.values(ChunkVisibility))
    histogram[v] = a.visibilityHistogram[v] + b.visibilityHistogram[v];
  return {
    turns: a.turns + b.turns,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    costUsd:
      a.turns === 0
        ? b.costUsd
        : b.turns === 0
          ? a.costUsd
          : a.costUsd !== undefined && b.costUsd !== undefined
            ? a.costUsd + b.costUsd
            : undefined,
    toolCalls: a.toolCalls + b.toolCalls,
    deniedToolCalls: a.deniedToolCalls + b.deniedToolCalls,
    visibleToolTokens: a.visibleToolTokens + b.visibleToolTokens,
    rawToolTokens: a.rawToolTokens + b.rawToolTokens,
    visibilityHistogram: histogram,
    ...(b.lastPlanTokens !== undefined
      ? { lastPlanTokens: b.lastPlanTokens, lastPlanBudget: b.lastPlanBudget }
      : a.lastPlanTokens !== undefined
        ? { lastPlanTokens: a.lastPlanTokens, lastPlanBudget: a.lastPlanBudget }
        : {}),
  };
}

export function emptySummary(): HarnessUsageSummary {
  return summarizeUsage([], [], []);
}
