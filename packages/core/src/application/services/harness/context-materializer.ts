/**
 * Turns a ContextPlan's chosen views into the text the model sees (spec 119).
 *
 * Shown chunks are wrapped in addressable tags; hidden candidates are listed
 * by id so the model knows they exist and can `expand_chunk` them instead of
 * re-running a tool.
 */
import {
  ChunkVisibility,
  type ContextPlan,
  type PlannedChunk,
} from '../../../domain/generated/output.js';
import type { IBlobStore, IHarnessContextRepository } from '../../ports/output/harness/index.js';
import { renderChunkView } from './renderers/chunk-renderers.js';

/** Hidden candidates listed in the index (most relevant first). */
export const HIDDEN_INDEX_LIMIT = 25;

export interface MaterializedChunk {
  planned: PlannedChunk;
  content: string;
}

function attr(value: string): string {
  return value.replace(/"/g, "'").replace(/\n/g, ' ').slice(0, 160);
}

export function materializeContext(
  shown: readonly MaterializedChunk[],
  hidden: readonly PlannedChunk[]
): string {
  const parts: string[] = [];
  for (const { planned, content } of shown) {
    if (planned.visibility === ChunkVisibility.Hidden) continue;
    parts.push(
      `<chunk id="${planned.chunkId}" kind="${planned.kind}" label="${attr(planned.label)}" view="${planned.visibility}">\n${content}\n</chunk>`
    );
  }
  const index = [...hidden]
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
    .slice(0, HIDDEN_INDEX_LIMIT);
  if (index.length > 0) {
    parts.push(
      `<hidden_chunks note="Not shown to save context. Call expand_chunk with an id to see one.">\n${index
        .map((h) => `${h.chunkId} ${h.kind} ${attr(h.label)}`)
        .join(
          '\n'
        )}${hidden.length > index.length ? `\n… ${hidden.length - index.length} more` : ''}\n</hidden_chunks>`
    );
  }
  return parts.join('\n\n');
}

/**
 * Rebuild the exact text a persisted plan materialized, from the store alone
 * (acceptance: a model call can be reconstructed from its ContextPlan).
 */
export async function rematerializePlan(
  plan: ContextPlan,
  context: IHarnessContextRepository,
  blobs: IBlobStore
): Promise<string> {
  const chunks = await context.getChunks(plan.chunks.map((c) => c.chunkId));
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const shown: MaterializedChunk[] = [];
  const hidden: PlannedChunk[] = [];
  for (const p of plan.chunks) {
    const chunk = byId.get(p.chunkId);
    if (!chunk || p.visibility === ChunkVisibility.Hidden) {
      hidden.push(p);
      continue;
    }
    const raw = await blobs.getText(chunk.contentRef);
    shown.push({
      planned: p,
      content: renderChunkView(chunk, raw, p.visibility, plan.query).content,
    });
  }
  return materializeContext(shown, hidden);
}
