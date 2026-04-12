/**
 * Together AI Model Catalog
 *
 * Fetches the list of models available on Together AI via `/v1/models`.
 * Together's catalog endpoint requires an API key, so callers MUST supply a
 * token — without one the list will be empty.
 *
 * Results are cached in-process with a short TTL.
 *
 * API docs: https://docs.together.ai/reference/models-1
 */

import type { AgentModelListing } from '../../../../../application/ports/output/agents/agent-executor-factory.interface.js';

const ENDPOINT = 'https://api.together.xyz/v1/models';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface TogetherAiPricing {
  input?: number;
  output?: number;
}

interface TogetherAiModelEntry {
  id: string;
  display_name?: string;
  organization?: string;
  context_length?: number;
  type?: string;
  pricing?: TogetherAiPricing;
}

type FetchFn = typeof fetch;

export class TogetherAiModelCatalogService {
  private cache: { expiresAt: number; data: AgentModelListing[]; key: string } | null = null;

  constructor(private readonly fetchFn: FetchFn = fetch) {}

  async listModels(apiKey?: string): Promise<AgentModelListing[]> {
    if (!apiKey) return [];

    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now && this.cache.key === apiKey) {
      return this.cache.data;
    }

    let response: Response;
    try {
      response = await this.fetchFn(ENDPOINT, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      });
    } catch {
      return this.cache?.data ?? [];
    }

    if (!response.ok) {
      return this.cache?.data ?? [];
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return this.cache?.data ?? [];
    }

    // Together's /v1/models returns an array directly.
    const entries = Array.isArray(body) ? (body as TogetherAiModelEntry[]) : [];

    const listings: AgentModelListing[] = entries
      .filter((entry) => !entry.type || entry.type === 'chat' || entry.type === 'language')
      .map((entry) => {
        const input = entry.pricing?.input ?? 0;
        const output = entry.pricing?.output ?? 0;
        const isFree = input === 0 && output === 0;
        return {
          id: entry.id,
          displayName: entry.display_name,
          contextLength: entry.context_length,
          isFree,
          vendor:
            entry.organization ?? (entry.id.includes('/') ? entry.id.split('/')[0] : undefined),
        };
      });

    this.cache = { expiresAt: now + CACHE_TTL_MS, data: listings, key: apiKey };
    return listings;
  }
}
