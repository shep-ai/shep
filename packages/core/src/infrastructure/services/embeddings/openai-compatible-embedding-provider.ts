/**
 * OpenAiCompatibleEmbeddingProvider
 *
 * Provider-agnostic embedding backend: any OpenAI-compatible `/embeddings`
 * endpoint (OpenAI, Azure OpenAI, a local server, etc.). Configured entirely via
 * environment variables so no provider SDK is hardcoded:
 *
 *   SHEP_EMBEDDINGS_API_KEY    required — enables the provider
 *   SHEP_EMBEDDINGS_BASE_URL   default https://api.openai.com/v1
 *   SHEP_EMBEDDINGS_MODEL      default text-embedding-3-small
 *
 * When no API key is present `isAvailable()` returns false and the scorer falls
 * back to the deterministic lexical scorer — so default/offline setups (and CI)
 * never make a network call.
 */

import { injectable } from 'tsyringe';
import type { IEmbeddingProvider } from '../../../application/ports/output/services/embedding-provider.interface.js';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'text-embedding-3-small';
const REQUEST_TIMEOUT_MS = 15_000;

interface EmbeddingResponse {
  data?: { embedding: number[] }[];
}

@injectable()
export class OpenAiCompatibleEmbeddingProvider implements IEmbeddingProvider {
  private get apiKey(): string | undefined {
    return process.env['SHEP_EMBEDDINGS_API_KEY'];
  }

  private get baseUrl(): string {
    const configured = process.env['SHEP_EMBEDDINGS_BASE_URL']?.trim();
    return (configured && configured.length > 0 ? configured : DEFAULT_BASE_URL).replace(
      /\/+$/,
      ''
    );
  }

  private get model(): string {
    const configured = process.env['SHEP_EMBEDDINGS_MODEL']?.trim();
    return configured && configured.length > 0 ? configured : DEFAULT_MODEL;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new Error('Embedding provider not configured (SHEP_EMBEDDINGS_API_KEY missing)');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: this.model, input: texts }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Embedding request failed: ${response.status} ${response.statusText}`);
      }

      const json = (await response.json()) as EmbeddingResponse;
      const vectors = json.data?.map((d) => d.embedding);
      if (vectors?.length !== texts.length) {
        throw new Error('Embedding response shape mismatch');
      }
      return vectors;
    } finally {
      clearTimeout(timeout);
    }
  }
}
