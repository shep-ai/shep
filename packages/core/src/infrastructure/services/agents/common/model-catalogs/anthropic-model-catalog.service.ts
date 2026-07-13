/**
 * Anthropic Model Catalog Service
 *
 * Fetches the current list of Claude models from Anthropic's API with in-process
 * caching and graceful fallback to static catalog. Follows the same pattern as
 * OpenRouter and Together AI dynamic catalogs.
 *
 * Cache Strategy:
 * - In-process Map with TTL (default 1 hour)
 * - Optional API key for authenticated requests
 * - Graceful fallback to cached or empty list on API errors
 * - Configurable timeout for fetch requests (default 5s)
 *
 * API docs: https://docs.anthropic.com/en/api/models
 */

import type { AgentModelListing } from '../../../../../application/ports/output/agents/agent-executor-factory.interface.js';

// Anthropic models endpoint (subject to change; may use SDK internals if API endpoint not public)
const ENDPOINT = 'https://api.anthropic.com/v1/models';

// Default cache TTL: 1 hour (Claude models release less frequently than OpenRouter/Together AI)
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;

// Default fetch timeout: 5 seconds
const DEFAULT_FETCH_TIMEOUT_MS = 5000;

/**
 * Anthropic API response types for model listing
 */
interface AnthropicModelEntry {
  id: string;
  display_name?: string;
  description?: string;
  context_length?: number;
  // Future fields: pricing, capabilities, created_at, etc.
}

interface AnthropicListResponse {
  data?: AnthropicModelEntry[];
}

type FetchFn = typeof fetch;

/**
 * Service that fetches Claude models from Anthropic's API with caching and fallback.
 *
 * Implements IAgentModelCatalogService pattern (same as OpenRouter/Together AI).
 */
export class AnthropicModelCatalogService {
  private cache: { expiresAt: number; data: AgentModelListing[] } | null = null;
  private readonly cacheTTLMs: number;
  private readonly fetchTimeoutMs: number;

  /**
   * @param fetchFn - HTTP fetch function (injectable for testing)
   * @param fetchTimeoutMs - Timeout for fetch requests in milliseconds (default 5000)
   * @param cacheTTLMs - Cache TTL in milliseconds (default 1 hour)
   */
  constructor(
    private readonly fetchFn: FetchFn = fetch,
    fetchTimeoutMs?: number,
    cacheTTLMs?: number
  ) {
    this.fetchTimeoutMs = fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    this.cacheTTLMs = cacheTTLMs ?? DEFAULT_CACHE_TTL_MS;
  }

  /**
   * Fetch the list of available Claude models from Anthropic's API.
   * Returns cached results if cache is still valid, otherwise fetches fresh data.
   * Falls back to cached or empty list on error.
   *
   * @param apiKey - Optional Anthropic API key for authenticated requests
   * @returns Array of available Claude models (AgentModelListing format)
   */
  async listModels(apiKey?: string): Promise<AgentModelListing[]> {
    const now = Date.now();

    // Check cache validity
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.data;
    }

    // Attempt to fetch from API
    const listings = await this.fetchFromApi(apiKey);

    // Cache successful results
    if (listings.length > 0) {
      this.cache = { expiresAt: now + this.cacheTTLMs, data: listings };
    }

    return listings;
  }

  /**
   * Clear the cache (useful for testing).
   */
  clearCache(): void {
    this.cache = null;
  }

  /**
   * Fetch models from Anthropic API with error handling.
   * Returns fallback (cached or empty array) on error.
   *
   * @param apiKey - Optional Anthropic API key
   * @returns Array of model listings, or empty array on error
   * @private
   */
  private async fetchFromApi(apiKey?: string): Promise<AgentModelListing[]> {
    try {
      // Prepare headers
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      // Fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeoutMs);

      let response: Response;
      try {
        response = await this.fetchFn(ENDPOINT, {
          headers,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // Check response status
      if (!response.ok) {
        return this.cache?.data ?? [];
      }

      // Parse JSON
      let body: AnthropicListResponse;
      try {
        body = (await response.json()) as AnthropicListResponse;
      } catch {
        return this.cache?.data ?? [];
      }

      // Convert model entries to listings
      const listings = this.convertEntries(body.data ?? []);
      return listings;
    } catch {
      // On any error (network, abort, etc.), return cached data if available
      return this.cache?.data ?? [];
    }
  }

  /**
   * Convert Anthropic API model entries to AgentModelListing format.
   *
   * @param entries - Raw model entries from Anthropic API
   * @returns Formatted model listings
   * @private
   */
  private convertEntries(entries: AnthropicModelEntry[]): AgentModelListing[] {
    return entries
      .filter((entry) => entry.id) // Skip entries without required id field
      .map((entry) => ({
        id: entry.id,
        displayName: entry.display_name,
        description: entry.description,
        contextLength: entry.context_length,
        // Future: add pricing, capabilities, deprecated flag, etc.
      }));
  }
}
