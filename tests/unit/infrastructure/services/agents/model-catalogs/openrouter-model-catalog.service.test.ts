/**
 * OpenRouterModelCatalogService Unit Tests
 *
 * The catalog is fetched while a settings page or the model picker waits on
 * it, so the upstream request must be bounded: a stalled connection has to
 * fail over to the cached/empty list instead of hanging the caller.
 */

import { describe, it, expect, vi } from 'vitest';
import { OpenRouterModelCatalogService } from '@/infrastructure/services/agents/common/model-catalogs/openrouter-model-catalog.service.js';

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('OpenRouterModelCatalogService', () => {
  it('should bound the catalog request with an abort signal', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse({ data: [] }));
    const catalog = new OpenRouterModelCatalogService(fetchFn as unknown as typeof fetch);

    await catalog.listModels();

    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('should return an empty list when the request times out', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(
        new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      );
    const catalog = new OpenRouterModelCatalogService(fetchFn as unknown as typeof fetch);

    await expect(catalog.listModels()).resolves.toEqual([]);
  });

  it('should map catalog entries to listings', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okResponse({
        data: [
          {
            id: 'vendor/model-a',
            name: 'Model A',
            context_length: 1000,
            pricing: { prompt: '0', completion: '0' },
          },
        ],
      })
    );
    const catalog = new OpenRouterModelCatalogService(fetchFn as unknown as typeof fetch);

    await expect(catalog.listModels()).resolves.toEqual([
      {
        id: 'vendor/model-a',
        displayName: 'Model A',
        description: undefined,
        contextLength: 1000,
        isFree: true,
        vendor: 'vendor',
      },
    ]);
  });
});
