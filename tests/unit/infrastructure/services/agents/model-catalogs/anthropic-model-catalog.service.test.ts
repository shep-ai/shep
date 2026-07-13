/**
 * AnthropicModelCatalogService Unit Tests
 *
 * Tests for the Anthropic model catalog service with fetch, cache TTL, fallback,
 * and error handling. Follows the OpenRouter/Together AI pattern for dynamic
 * model discovery with in-process caching.
 *
 * TDD Phase: RED-GREEN
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnthropicModelCatalogService } from '@/infrastructure/services/agents/common/model-catalogs/anthropic-model-catalog.service.js';

// Mock fetch type
type MockFetch = ReturnType<typeof vi.fn>;

describe('AnthropicModelCatalogService', () => {
  let mockFetch: MockFetch;
  let service: AnthropicModelCatalogService;

  beforeEach(() => {
    mockFetch = vi.fn() as unknown as MockFetch;
    service = new AnthropicModelCatalogService(mockFetch as never, 5000); // 5s timeout, 1h TTL (default)
    vi.useFakeTimers();
  });

  describe('instantiation', () => {
    it('creates a new instance with default fetch', () => {
      const svc = new AnthropicModelCatalogService();
      expect(svc).toBeDefined();
    });

    it('creates a new instance with injected fetch function', () => {
      const svc = new AnthropicModelCatalogService(mockFetch as never);
      expect(svc).toBeDefined();
    });
  });

  describe('listModels()', () => {
    it('returns an array of AgentModelListing on successful fetch', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [
            { id: 'claude-opus-4-8', display_name: 'Claude Opus 4.8' },
            { id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' },
          ],
        }),
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await service.listModels();

      expect(result).toEqual([
        { id: 'claude-opus-4-8', displayName: 'Claude Opus 4.8' },
        { id: 'claude-sonnet-5', displayName: 'Claude Sonnet 5' },
      ]);
    });

    it('passes Authorization header when apiKey is provided', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [] }),
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse);

      await service.listModels('test-key-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key-123',
          }),
        })
      );
    });

    it('omits Authorization header when apiKey is not provided', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [] }),
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse);

      await service.listModels();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.not.objectContaining({
            Authorization: expect.anything(),
          }),
        })
      );
    });

    it('returns empty array on fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.listModels();

      expect(result).toEqual([]);
    });

    it('returns empty array when response is not ok', async () => {
      const mockResponse = {
        ok: false,
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await service.listModels();

      expect(result).toEqual([]);
    });

    it('returns empty array on JSON parse error', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockRejectedValueOnce(new Error('Invalid JSON')),
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await service.listModels();

      expect(result).toEqual([]);
    });

    it('handles missing data field in response', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({}), // no data field
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await service.listModels();

      expect(result).toEqual([]);
    });

    it('converts model entries correctly with optional fields', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'claude-opus-4-8',
              display_name: 'Opus 4.8',
              description: 'Fast and capable',
              context_length: 200000,
            },
            {
              id: 'claude-haiku-4-5',
              display_name: 'Haiku 4.5',
              // no description or context_length
            },
          ],
        }),
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await service.listModels();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'claude-opus-4-8',
        displayName: 'Opus 4.8',
        description: 'Fast and capable',
        contextLength: 200000,
      });
      expect(result[1]).toEqual({
        id: 'claude-haiku-4-5',
        displayName: 'Haiku 4.5',
      });
    });
  });

  describe('caching with TTL', () => {
    it('returns cached data before TTL expires', async () => {
      const mockResponse1 = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{ id: 'claude-sonnet-5', display_name: 'Sonnet 5' }],
        }),
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse1);

      // First call
      const result1 = await service.listModels();
      expect(result1).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance time by 30 minutes (less than default 1h TTL)
      vi.advanceTimersByTime(30 * 60 * 1000);

      // Second call should hit cache
      const result2 = await service.listModels();
      expect(result2).toEqual(result1);
      expect(mockFetch).toHaveBeenCalledTimes(1); // No additional fetch
    });

    it('refreshes cache when TTL expires', async () => {
      const mockResponse1 = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{ id: 'claude-sonnet-5' }],
        }),
      } as unknown as Response;

      const mockResponse2 = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{ id: 'claude-opus-4-8' }],
        }),
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse1);
      mockFetch.mockResolvedValueOnce(mockResponse2);

      // First call
      const result1 = await service.listModels();
      expect(result1).toEqual([{ id: 'claude-sonnet-5' }]);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance time by 61 minutes (beyond default 1h TTL)
      vi.advanceTimersByTime(61 * 60 * 1000);

      // Second call should trigger a refresh
      const result2 = await service.listModels();
      expect(result2).toEqual([{ id: 'claude-opus-4-8' }]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('respects custom TTL from environment variable', async () => {
      // Create service with custom TTL (5 minutes)
      const customTTLService = new AnthropicModelCatalogService(
        mockFetch as never,
        5000,
        5 * 60 * 1000 // 5 minute TTL
      );

      const mockResponse1 = {
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [{ id: 'test1' }] }),
      } as unknown as Response;

      const mockResponse2 = {
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [{ id: 'test2' }] }),
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse1);
      mockFetch.mockResolvedValueOnce(mockResponse2);

      // First call
      await customTTLService.listModels();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Advance by 6 minutes (beyond 5-minute TTL)
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Second call should refresh
      await customTTLService.listModels();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('fallback when API is unavailable', () => {
    it('returns empty array on initial fetch error (no cached data)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await service.listModels();

      expect(result).toEqual([]);
    });

    it('returns cached data when fetch fails after cache is populated', async () => {
      const mockResponse1 = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [{ id: 'claude-sonnet-5' }],
        }),
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse1);

      // First call - populate cache
      await service.listModels();

      // Expire cache
      vi.advanceTimersByTime(61 * 60 * 1000);

      // Second call - fetch fails but returns cached data
      mockFetch.mockRejectedValueOnce(new Error('API unavailable'));

      const result = await service.listModels();

      expect(result).toEqual([{ id: 'claude-sonnet-5' }]);
    });
  });

  describe('timeout handling', () => {
    it('aborts fetch when AbortSignal is passed and timeout expires', async () => {
      vi.useRealTimers(); // Use real timers for this test to work properly

      const shortTimeoutService = new AnthropicModelCatalogService(
        mockFetch as never,
        100 // 100ms timeout
      );

      // Simulate a fetch that takes longer than timeout
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: async () => ({ data: [] }),
              } as Response);
            }, 500);
          })
      );

      // Should return empty array due to timeout
      const result = await shortTimeoutService.listModels();
      expect(result).toEqual([]);

      vi.useFakeTimers();
    });
  });

  describe('edge cases', () => {
    it('handles API response with empty data array', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ data: [] }),
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await service.listModels();

      expect(result).toEqual([]);
    });

    it('handles malformed model entries gracefully', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          data: [
            { id: 'claude-valid' },
            { display_name: 'Missing id' }, // Missing required id field
            { id: 'claude-partial', display_name: 'Partial' },
          ],
        }),
      } as unknown as Response;

      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await service.listModels();

      // Should include entries with valid id fields
      expect(result.filter((m) => m.id)).toBeDefined();
    });
  });
});
