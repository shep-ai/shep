import 'reflect-metadata';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { OpenAiCompatibleEmbeddingProvider } from '@/infrastructure/services/embeddings/openai-compatible-embedding-provider.js';

const ENV_KEYS = [
  'SHEP_EMBEDDINGS_API_KEY',
  'SHEP_EMBEDDINGS_BASE_URL',
  'SHEP_EMBEDDINGS_MODEL',
] as const;

function clearEnv(): void {
  for (const k of ENV_KEYS) delete process.env[k];
}

describe('OpenAiCompatibleEmbeddingProvider', () => {
  afterEach(() => {
    clearEnv();
    vi.restoreAllMocks();
  });

  it('is unavailable without an API key', () => {
    clearEnv();
    expect(new OpenAiCompatibleEmbeddingProvider().isAvailable()).toBe(false);
  });

  it('is available when an API key is set', () => {
    process.env['SHEP_EMBEDDINGS_API_KEY'] = 'sk-test';
    expect(new OpenAiCompatibleEmbeddingProvider().isAvailable()).toBe(true);
  });

  it('returns [] for an empty input without calling the network', async () => {
    process.env['SHEP_EMBEDDINGS_API_KEY'] = 'sk-test';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await new OpenAiCompatibleEmbeddingProvider().embed([]);
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts to the configured endpoint and parses embeddings', async () => {
    process.env['SHEP_EMBEDDINGS_API_KEY'] = 'sk-test';
    process.env['SHEP_EMBEDDINGS_BASE_URL'] = 'https://example.test/v1/';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }] }),
        {
          status: 200,
        }
      )
    );

    const vectors = await new OpenAiCompatibleEmbeddingProvider().embed(['a', 'b']);

    expect(vectors).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://example.test/v1/embeddings');
  });

  it('throws on a non-OK response', async () => {
    process.env['SHEP_EMBEDDINGS_API_KEY'] = 'sk-test';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(new OpenAiCompatibleEmbeddingProvider().embed(['a'])).rejects.toThrow();
  });
});
