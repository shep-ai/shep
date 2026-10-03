/**
 * Turns a complete_task call (or a final answer) into a HarnessTaskResult.
 */
import {
  HarnessTaskOutcome,
  type HarnessEvidenceRef,
  type HarnessTaskResult,
} from '../../../domain/generated/output.js';

const OUTCOMES = new Set<string>(Object.values(HarnessTaskOutcome));

export function resultFromCompleteTask(
  args: Record<string, unknown>,
  producedChunkIds: string[],
  repoSnapshotId?: string
): HarnessTaskResult {
  const status = OUTCOMES.has(String(args.status))
    ? (args.status as HarnessTaskOutcome)
    : HarnessTaskOutcome.Success;
  const evidence: HarnessEvidenceRef[] = Array.isArray(args.evidence)
    ? (args.evidence as Record<string, unknown>[])
        .filter((e) => typeof e.resource === 'string')
        .map((e) => ({
          resource: String(e.resource),
          ...(repoSnapshotId && { repoSnapshotId }),
          ...(typeof e.startLine === 'number' && { startLine: e.startLine }),
          ...(typeof e.endLine === 'number' && { endLine: e.endLine }),
        }))
    : [];
  return {
    status,
    summary:
      typeof args.summary === 'string' && args.summary.trim()
        ? args.summary.trim()
        : 'Task finished.',
    evidence,
    producedChunkIds,
    ...(typeof args.confidence === 'number' && { confidence: args.confidence }),
  };
}

export function failureResult(summary: string, producedChunkIds: string[]): HarnessTaskResult {
  return { status: HarnessTaskOutcome.Failure, summary, evidence: [], producedChunkIds };
}
