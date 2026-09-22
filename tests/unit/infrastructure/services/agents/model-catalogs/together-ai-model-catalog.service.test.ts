/**
 * TogetherAiModelCatalogService Unit Tests
 *
 * The catalog is fetched while a settings page or the model picker waits on
 * it, so the upstream request must be bounded: a stalled connection has to
 * fail over to the cached/empty list instead of hanging the caller.
 */

import { describe, it, expect, vi } from 'vitest';
import { TogetherAiModelCatalogService } from '@/infrastructure/services/agents/common/model-catalogs/together-ai-model-catalog.service.js';

function okResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('TogetherAiModelCatalogService', () => {
  it('should bound the catalog request with an abort signal', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse([]));
    const catalog = new TogetherAiModelCatalogService(fetchFn as unknown as typeof fetch);

    await catalog.listModels('tg-key');

    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('should return an empty list when the request times out', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(
        new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      );
    const catalog = new TogetherAiModelCatalogService(fetchFn as unknown as typeof fetch);

    await expect(catalog.listModels('tg-key')).resolves.toEqual([]);
  });

  it('should not call upstream without an API key', async () => {
    const fetchFn = vi.fn();
    const catalog = new TogetherAiModelCatalogService(fetchFn as unknown as typeof fetch);

    await expect(catalog.listModels()).resolves.toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
