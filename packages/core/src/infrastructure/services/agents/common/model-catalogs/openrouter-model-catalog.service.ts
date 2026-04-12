/**
 * OpenRouter Model Catalog
 *
 * Fetches the current list of models from OpenRouter's public `/api/v1/models`
 * endpoint. Results are cached in-process with a short TTL so repeated UI
 * lookups don't hammer the API.
 *
 * OpenRouter allows anonymous access to the catalog — a token is optional but
 * still passed along when available so the response honours the caller's
 * organisation filters.
 *
 * API docs: https://openrouter.ai/docs/api-reference/list-available-models
 */

import type { AgentModelListing } from '../../../../../application/ports/output/agents/agent-executor-factory.interface.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/models';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface OpenRouterPricing {
  prompt?: string;
  completion?: string;
}

interface OpenRouterModelEntry {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: OpenRouterPricing;
}

interface OpenRouterListResponse {
  data?: OpenRouterModelEntry[];
}

type FetchFn = typeof fetch;

export class OpenRouterModelCatalogService {
  private cache: { expiresAt: number; data: AgentModelListing[] } | null = null;

  constructor(private readonly fetchFn: FetchFn = fetch) {}

  async listModels(apiKey?: string): Promise<AgentModelListing[]> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.data;
    }

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    let response: Response;
    try {
      response = await this.fetchFn(ENDPOINT, { headers });
    } catch {
      return this.cache?.data ?? [];
    }

    if (!response.ok) {
      return this.cache?.data ?? [];
    }

    let body: OpenRouterListResponse;
    try {
      body = (await response.json()) as OpenRouterListResponse;
    } catch {
      return this.cache?.data ?? [];
    }

    const listings: AgentModelListing[] = (body.data ?? []).map((entry) => {
      const promptPrice = parseFloat(entry.pricing?.prompt ?? '0');
      const completionPrice = parseFloat(entry.pricing?.completion ?? '0');
      const isFree = promptPrice === 0 && completionPrice === 0;
      const vendor = entry.id.includes('/') ? entry.id.split('/')[0] : undefined;
      return {
        id: entry.id,
        displayName: entry.name,
        description: entry.description,
        contextLength: entry.context_length,
        isFree,
        vendor,
      };
    });

    this.cache = { expiresAt: now + CACHE_TTL_MS, data: listings };
    return listings;
  }
}
