/**
 * RenderChunkViewUseCase (spec 119): show a chunk at short / long / full.
 * Views are rendered from the stored raw content — the tool is never re-run.
 */
import { inject, injectable } from 'tsyringe';
import {
  ChunkVisibility,
  SensitivityLabel,
  type ContextChunk,
} from '../../../domain/generated/output.js';
import {
  HARNESS_TOKENS,
  type IBlobStore,
  type IHarnessContextRepository,
} from '../../ports/output/harness/index.js';
import { renderChunkView } from '../../services/harness/renderers/chunk-renderers.js';
import { HarnessNotFoundError } from './harness-errors.js';

export interface RenderChunkViewInput {
  chunkId: string;
  visibility: ChunkVisibility;
  /** Query to render for (defaults to the chunk label). */
  query?: string;
}

export interface RenderedChunkView {
  chunk: ContextChunk;
  visibility: ChunkVisibility;
  content: string;
  truncated: boolean;
  rendererId: string;
  /** Secret chunks are never rendered, here or to the model. */
  redacted: boolean;
}

@injectable()
export class RenderChunkViewUseCase {
  constructor(
    @inject(HARNESS_TOKENS.ContextRepository) private readonly context: IHarnessContextRepository,
    @inject(HARNESS_TOKENS.BlobStore) private readonly blobs: IBlobStore
  ) {}

  async execute(input: RenderChunkViewInput): Promise<RenderedChunkView> {
    const chunk = await this.context.getChunk(input.chunkId);
    if (!chunk) throw new HarnessNotFoundError('chunk', input.chunkId);
    if (chunk.sensitivity === SensitivityLabel.Secret) {
      return {
        chunk,
        visibility: input.visibility,
        content: '',
        truncated: false,
        rendererId: 'redacted',
        redacted: true,
      };
    }
    const raw = await this.blobs.getText(chunk.contentRef);
    const view = renderChunkView(chunk, raw, input.visibility, input.query ?? chunk.label);
    return { chunk, visibility: input.visibility, ...view, redacted: false };
  }
}
