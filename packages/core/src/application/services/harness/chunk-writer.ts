/**
 * ChunkWriter (spec 119): persists raw content in the blob store and creates
 * the addressable ContextChunk — always before any rendering, so every view
 * can be traced back to (and regenerated from) the raw content.
 *
 * A newer read of the same repository path supersedes the older chunk; both
 * stay in the store for audit.
 */
import { randomUUID } from 'node:crypto';
import {
  SensitivityLabel,
  type ChunkKind,
  type ContextChunk,
} from '../../../domain/generated/output.js';
import { estimateTokens, sha256Hex } from '../../../domain/harness/fingerprints.js';
import type { IBlobStore, IHarnessContextRepository } from '../../ports/output/harness/index.js';
import { ChunkTag } from './candidate-retriever.js';

export interface WriteChunkInput {
  sessionId: string;
  taskId?: string;
  kind: ChunkKind;
  label: string;
  source: string;
  content: string;
  path?: string;
  repoSnapshotId?: string;
  pinned?: boolean;
  tags?: string[];
  sensitivity?: SensitivityLabel;
}

export class ChunkWriter {
  constructor(
    private readonly context: IHarnessContextRepository,
    private readonly blobs: IBlobStore
  ) {}

  async write(input: WriteChunkInput): Promise<ContextChunk> {
    const contentRef = await this.blobs.put(input.content);
    const now = new Date();
    const chunk: ContextChunk = {
      id: randomUUID(),
      sessionId: input.sessionId,
      ...(input.taskId && { taskId: input.taskId }),
      kind: input.kind,
      label: input.label,
      source: input.source,
      contentRef,
      contentHash: sha256Hex(input.content),
      tokenEstimate: estimateTokens(input.content),
      sensitivity: input.sensitivity ?? SensitivityLabel.Internal,
      ...(input.path && { path: input.path }),
      ...(input.repoSnapshotId && { repoSnapshotId: input.repoSnapshotId }),
      pinned: input.pinned ?? false,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    const previous = input.path
      ? await this.context.findLatestChunkByPath(input.sessionId, input.path, input.kind)
      : null;
    await this.context.putChunk(chunk);
    if (previous) {
      await this.context.markSuperseded(previous.id, chunk.id);
      return { ...chunk, supersedes: previous.id };
    }
    return chunk;
  }

  /** Earlier reads of files that just changed no longer describe them. */
  async markStale(sessionId: string, paths: readonly string[]): Promise<void> {
    await markPathsStale(this.context, sessionId, paths);
  }

  async raw(chunk: Pick<ContextChunk, 'contentRef'>): Promise<string> {
    return this.blobs.getText(chunk.contentRef);
  }
}

/** Tags every live chunk read from one of `paths` as stale, so it stops reaching the model. */
export async function markPathsStale(
  context: IHarnessContextRepository,
  sessionId: string,
  paths: readonly string[]
): Promise<void> {
  const changed = new Set(paths);
  for (const chunk of await context.listChunks({ sessionId })) {
    if (chunk.path && changed.has(chunk.path) && !chunk.tags.includes(ChunkTag.Stale)) {
      await context.putChunk({
        ...chunk,
        tags: [...chunk.tags, ChunkTag.Stale],
        updatedAt: new Date(),
      });
    }
  }
}
