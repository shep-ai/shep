/**
 * Pure scoring of one eval case run and aggregation into a paired report
 * (spec 119, F9): success, tokens, cost, turns, wall time, repeated reads,
 * tool-output visibility and required-evidence recall.
 */
import {
  type HarnessMode,
  type ContextChunk,
  type HarnessEvalResult,
  type HarnessTaskResult,
  type HarnessToolCall,
} from '../../../domain/generated/output.js';
import type { HarnessUsageSummary } from './harness-metrics.js';

/** Capabilities whose repeats count as re-reading something already seen. */
const READ_CAPABILITIES: ReadonlySet<string> = new Set([
  'read_file',
  'search_source_code',
  'list_files',
  'inspect_git',
]);

export const EvalScore = {
  Success: 'success',
  InputTokens: 'inputTokens',
  OutputTokens: 'outputTokens',
  CostUsd: 'costUsd',
  Turns: 'turns',
  WallMs: 'wallMs',
  RepeatedReads: 'repeatedReads',
  ToolOutputRatio: 'toolOutputRatio',
  EvidenceRecall: 'evidenceRecall',
} as const;
export type EvalScore = (typeof EvalScore)[keyof typeof EvalScore];

export function repeatedReads(toolCalls: readonly HarnessToolCall[]): number {
  const seen = new Set<string>();
  let repeats = 0;
  for (const c of toolCalls) {
    if (!READ_CAPABILITIES.has(c.capabilityId)) continue;
    const key = `${c.capabilityId}:${c.argumentsHash}`;
    if (seen.has(key)) repeats += 1;
    else seen.add(key);
  }
  return repeats;
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');

export function evidenceRecall(
  required: readonly string[] | undefined,
  result: HarnessTaskResult | undefined,
  chunks: readonly Pick<ContextChunk, 'path' | 'label'>[]
): number | undefined {
  if (!required || required.length === 0) return undefined;
  const seen = new Set<string>();
  for (const e of result?.evidence ?? []) seen.add(norm(e.resource));
  for (const c of chunks) if (c.path) seen.add(norm(c.path));
  const labels = chunks.map((c) => c.label);
  const hit = required.filter((r) => seen.has(norm(r)) || labels.some((l) => l.includes(norm(r))));
  return hit.length / required.length;
}

export function scoreRun(input: {
  success: boolean;
  usage: HarnessUsageSummary;
  wallMs: number;
  toolCalls: readonly HarnessToolCall[];
  recall: number | undefined;
}): Record<string, number> {
  const u = input.usage;
  return {
    [EvalScore.Success]: input.success ? 1 : 0,
    [EvalScore.InputTokens]: u.inputTokens,
    [EvalScore.OutputTokens]: u.outputTokens,
    ...(u.costUsd !== undefined && { [EvalScore.CostUsd]: u.costUsd }),
    [EvalScore.Turns]: u.turns,
    [EvalScore.WallMs]: input.wallMs,
    [EvalScore.RepeatedReads]: repeatedReads(input.toolCalls),
    ...(u.rawToolTokens > 0 && {
      [EvalScore.ToolOutputRatio]: u.visibleToolTokens / u.rawToolTokens,
    }),
    ...(input.recall !== undefined && { [EvalScore.EvidenceRecall]: input.recall }),
  };
}

export interface EvalVariantSummary {
  variant: HarnessMode;
  runs: number;
  /** Mean per score over the runs that reported it. */
  means: Partial<Record<EvalScore, number>>;
}

export interface EvalComparison {
  score: EvalScore;
  baseline?: number;
  queryAware?: number;
  /** (queryAware − baseline) / baseline, when both exist and baseline ≠ 0. */
  relativeChange?: number;
}

export function summarizeVariant(
  variant: HarnessMode,
  results: readonly HarnessEvalResult[]
): EvalVariantSummary {
  const mine = results.filter((r) => r.variant === variant);
  const means: Partial<Record<EvalScore, number>> = {};
  for (const score of Object.values(EvalScore)) {
    const values = mine
      .map((r) => r.scores[score])
      .filter((v): v is number => typeof v === 'number');
    if (values.length) means[score] = values.reduce((a, b) => a + b, 0) / values.length;
  }
  return { variant, runs: mine.length, means };
}

export function compareVariants(
  baseline: EvalVariantSummary | undefined,
  queryAware: EvalVariantSummary | undefined
): EvalComparison[] {
  return Object.values(EvalScore).map((score) => {
    const b = baseline?.means[score];
    const q = queryAware?.means[score];
    return {
      score,
      ...(b !== undefined && { baseline: b }),
      ...(q !== undefined && { queryAware: q }),
      ...(b !== undefined && q !== undefined && b !== 0 && { relativeChange: (q - b) / b }),
    };
  });
}
