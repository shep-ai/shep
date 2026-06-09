/**
 * IEmbeddingProvider (Output Port)
 *
 * Produces vector embeddings for text, used by the embedding-based memory
 * relevance scorer for semantic ranking. Kept provider-agnostic: any
 * OpenAI-compatible (or future) embedding backend implements this port behind a
 * config gate. Callers must tolerate `isAvailable() === false` and fall back to
 * a non-semantic path.
 */

export interface IEmbeddingProvider {
  /**
   * Whether the provider is configured and usable (e.g. an API key is present).
   * When false, callers must not call `embed` and should fall back.
   */
  isAvailable(): boolean;

  /**
   * Embed a batch of texts, returning one vector per input in the same order.
   * Implementations should throw on failure so callers can fall back.
   */
  embed(texts: string[]): Promise<number[][]>;
}
