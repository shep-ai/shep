/**
 * CandidateRetriever (spec 119, docs/04 "Stage 1: candidate generation").
 *
 * Cheap, deterministic signals pick tens to hundreds of chunks out of the
 * session; only those reach the decision provider. Each candidate carries the
 * reasons it was picked and a prior in [0, 1]. Secret chunks never become
 * candidates; superseded chunks drop out unless referenced explicitly.
 */
import {
  ChunkKind,
  SensitivityLabel,
  type ContextChunk,
  type HarnessTask,
} from '../../../domain/generated/output.js';
import type { IHarnessContextRepository } from '../../ports/output/harness/index.js';

export const CandidateReason = {
  CurrentTask: 'current_task',
  ExplicitReference: 'explicit_reference',
  PathMatch: 'path_match',
  UnresolvedError: 'unresolved_error',
  RecentTool: 'recent_tool',
  CurrentDiff: 'current_diff',
  Escalated: 'escalated',
  UserIncluded: 'user_included',
  Lexical: 'lexical',
} as const;

/** Tags the runtime puts on chunks. */
export const ChunkTag = {
  Failed: 'failed',
  PromptSection: 'prompt_section',
  /** Put by the session restorer on chunks of files that drifted. */
  Stale: 'stale',
} as const;

const TOOL_OUTPUT_KINDS = new Set<ChunkKind>([
  ChunkKind.File,
  ChunkKind.FileExcerpt,
  ChunkKind.SearchResult,
  ChunkKind.CommandOutput,
  ChunkKind.TestResult,
  ChunkKind.Diff,
  ChunkKind.ToolOutput,
]);
const RECENT_TOOL_WINDOW = 8;
const RECENT_PRIOR_MAX = 0.7;
const RECENT_PRIOR_STEP = 0.05;
const RECENT_PRIOR_MIN = 0.35;
const PRIOR = {
  explicit: 0.95,
  path: 0.9,
  error: 0.75,
  diff: 0.6,
} as const;

export type CandidateLock = 'none' | 'visible' | 'pinned';

export interface Candidate {
  chunk: ContextChunk;
  prior: number;
  reasons: string[];
  lock: CandidateLock;
}

export interface RetrieveInput {
  sessionId: string;
  task: HarnessTask;
  query: string;
  /** Chunks holding the current task's prompt sections (in order). */
  promptSectionChunkIds: readonly string[];
  /** Chunks the model or a person asked to see (expand_chunk, include). */
  forcedChunkIds: readonly string[];
  limit: number;
}

function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}

export class CandidateRetriever {
  constructor(private readonly context: IHarnessContextRepository) {}

  async retrieve(input: RetrieveInput): Promise<Candidate[]> {
    // Secret chunks never reach a model; stale chunks describe files that
    // changed since they were read (a fresh read supersedes them).
    const chunks = (await this.context.listChunks({ sessionId: input.sessionId })).filter(
      (c) => c.sensitivity !== SensitivityLabel.Secret && !c.tags.includes(ChunkTag.Stale)
    );
    const text = `${input.query}\n${input.task.goal}`;
    const lowered = text.toLowerCase();
    const sectionOrder = new Map(input.promptSectionChunkIds.map((id, i) => [id, i]));
    const forced = new Set(input.forcedChunkIds);

    const toolChunks = chunks
      .filter((c) => c.taskId === input.task.id && TOOL_OUTPUT_KINDS.has(c.kind))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    const recentRank = new Map(toolChunks.slice(0, RECENT_TOOL_WINDOW).map((c, i) => [c.id, i]));
    const latestFailed = toolChunks.find((c) => c.tags.includes(ChunkTag.Failed));
    const latestPassedSameLabel =
      latestFailed &&
      toolChunks.find(
        (c) =>
          c.label === latestFailed.label &&
          !c.tags.includes(ChunkTag.Failed) &&
          +new Date(c.createdAt) > +new Date(latestFailed.createdAt)
      );
    const latestDiff = chunks
      .filter((c) => c.kind === ChunkKind.Diff)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];

    const candidates: Candidate[] = [];
    for (const chunk of chunks) {
      const reasons: string[] = [];
      let prior = 0;
      let lock: CandidateLock = 'none';
      const bump = (reason: string, p: number) => {
        reasons.push(reason);
        prior = Math.max(prior, p);
      };
      if (sectionOrder.has(chunk.id)) {
        bump(CandidateReason.CurrentTask, 1);
        lock = chunk.pinned ? 'pinned' : 'visible';
      }
      if (forced.has(chunk.id)) reasons.push(CandidateReason.Escalated);
      if (lowered.includes(chunk.id)) bump(CandidateReason.ExplicitReference, PRIOR.explicit);
      if (
        chunk.path &&
        (lowered.includes(chunk.path.toLowerCase()) ||
          (basename(chunk.path).includes('.') &&
            lowered.includes(basename(chunk.path).toLowerCase())))
      ) {
        bump(CandidateReason.PathMatch, PRIOR.path);
      }
      if (latestFailed && chunk.id === latestFailed.id && !latestPassedSameLabel) {
        bump(CandidateReason.UnresolvedError, PRIOR.error);
      }
      const rank = recentRank.get(chunk.id);
      if (rank !== undefined) {
        bump(
          CandidateReason.RecentTool,
          Math.max(RECENT_PRIOR_MIN, RECENT_PRIOR_MAX - RECENT_PRIOR_STEP * rank)
        );
      }
      if (latestDiff && chunk.id === latestDiff.id) bump(CandidateReason.CurrentDiff, PRIOR.diff);
      if (reasons.length === 0) reasons.push(CandidateReason.Lexical);
      // Prompt sections of earlier tasks are history, not context, unless picked above.
      if (chunk.kind === ChunkKind.PromptSection && !sectionOrder.has(chunk.id) && prior === 0)
        continue;
      candidates.push({ chunk, prior, reasons, lock });
    }

    const locked = candidates.filter((c) => c.lock !== 'none' || forced.has(c.chunk.id));
    const rest = candidates
      .filter((c) => c.lock === 'none' && !forced.has(c.chunk.id))
      .sort(
        (a, b) => b.prior - a.prior || +new Date(b.chunk.createdAt) - +new Date(a.chunk.createdAt)
      )
      .slice(0, Math.max(0, input.limit - locked.length));
    locked.sort(
      (a, b) => (sectionOrder.get(a.chunk.id) ?? 1e9) - (sectionOrder.get(b.chunk.id) ?? 1e9)
    );
    return [...locked, ...rest];
  }
}
