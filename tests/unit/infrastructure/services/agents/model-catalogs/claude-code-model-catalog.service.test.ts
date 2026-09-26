/**
 * ClaudeCodeModelCatalogService Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ClaudeCodeModelCatalogService,
  mergeClaudeCatalogWithHardcoded,
  parseClaudeModelHelpOutput,
} from '@/infrastructure/services/agents/common/model-catalogs/claude-code-model-catalog.service.js';
import { MODEL_CATALOG_TTL_MS } from '@/infrastructure/services/agents/common/model-catalogs/catalog-fetch.js';
import { AgentType } from '@/domain/generated/output.js';
import { AGENT_CATALOG } from '@/domain/shared/agent-catalog.js';

const SAMPLE = `Current model: Opus 5.5 (default)
Usage: /model <name>. Available: sonnet, opus, haiku, fable, best, sonnet[1m], opus[1m], fable[1m], opusplan, default, or a full model ID.`;

describe('parseClaudeModelHelpOutput', () => {
  it('maps aliases to Shep canonical ids and dedupes', () => {
    const listings = parseClaudeModelHelpOutput(SAMPLE);
    expect(listings.map((l) => l.id)).toEqual([
      'claude-sonnet-5',
      'claude-opus-5-5',
      'claude-haiku-4-5',
      'claude-fable-5-1',
    ]);
    expect(listings.find((l) => l.id === 'claude-sonnet-5')?.displayName).toBe('sonnet');
  });

  it('returns empty when Available: is missing', () => {
    expect(parseClaudeModelHelpOutput('no models here')).toEqual([]);
  });

  it('passes through unmapped full model ids', () => {
    const text = 'Available: claude-opus-4-6-20250514, or a full model ID.';
    expect(parseClaudeModelHelpOutput(text).map((l) => l.id)).toEqual(['claude-opus-4-6-20250514']);
  });
});

describe('mergeClaudeCatalogWithHardcoded', () => {
  it('appends hardcoded Claude models missing from live', () => {
    const live = [{ id: 'claude-opus-5', displayName: 'opus' }];
    const merged = mergeClaudeCatalogWithHardcoded(live);
    const hardcoded = AGENT_CATALOG[AgentType.ClaudeCode].models;

    expect(merged[0]).toEqual(live[0]);
    expect(merged.map((l) => l.id)).toEqual(
      expect.arrayContaining([...hardcoded.slice(0, 5), 'claude-opus-5'])
    );
    expect(merged.length).toBeGreaterThanOrEqual(hardcoded.length);
  });
});

/** No API credential: the Models API source yields nothing, as on a subscription-only machine. */
const noApi = () => Promise.resolve(null);

describe('ClaudeCodeModelCatalogService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('caches within the shared TTL and merges hardcoded models', async () => {
    const run = vi.fn().mockResolvedValue(SAMPLE);
    const catalog = new ClaudeCodeModelCatalogService({ listApiModels: noApi, listCliModels: run });

    const first = await catalog.listModels();
    const second = await catalog.listModels();
    expect(run).toHaveBeenCalledTimes(1);
    expect(first.map((l) => l.id)).toContain('claude-opus-5');
    expect(first.map((l) => l.id)).toContain('claude-opus-4-8');
    expect(second).toEqual(first);
    expect(second).not.toBe(first);

    await vi.advanceTimersByTimeAsync(MODEL_CATALOG_TTL_MS + 1);
    await catalog.listModels();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('returns last-good when a later fetch fails', async () => {
    const run = vi.fn().mockResolvedValueOnce(SAMPLE).mockRejectedValueOnce(new Error('timeout'));
    const catalog = new ClaudeCodeModelCatalogService({ listApiModels: noApi, listCliModels: run });

    const first = await catalog.listModels();
    await vi.advanceTimersByTimeAsync(MODEL_CATALOG_TTL_MS + 1);
    const second = await catalog.listModels();

    expect(second.map((l) => l.id)).toEqual(first.map((l) => l.id));
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe('ClaudeCodeModelCatalogService discovery order', () => {
  const API_MODELS = [
    {
      id: 'claude-opus-5-5',
      displayName: 'Opus 5.5',
      contextLength: 1_000_000,
      vendor: 'anthropic',
    },
    { id: 'claude-sonnet-5', displayName: 'Sonnet 5', vendor: 'anthropic' },
  ];

  let stderr: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    stderr.mockRestore();
  });

  it('lists Models API results first and never spawns the claude CLI', async () => {
    const listCliModels = vi.fn().mockResolvedValue(SAMPLE);
    const catalog = new ClaudeCodeModelCatalogService({
      listApiModels: vi.fn().mockResolvedValue(API_MODELS),
      listCliModels,
    });

    const listings = await catalog.listModels();

    expect(listCliModels).not.toHaveBeenCalled();
    expect(listings.slice(0, 2)).toEqual(API_MODELS);
  });

  it('keeps hardcoded models the API did not return', async () => {
    const catalog = new ClaudeCodeModelCatalogService({
      listApiModels: vi.fn().mockResolvedValue(API_MODELS),
      listCliModels: vi.fn(),
    });

    const ids = (await catalog.listModels()).map((l) => l.id);

    expect(ids).toEqual(expect.arrayContaining([...AGENT_CATALOG[AgentType.ClaudeCode].models]));
    expect(ids.filter((id) => id === 'claude-sonnet-5')).toHaveLength(1);
  });

  it.each([
    ['no credential', () => Promise.resolve(null)],
    ['an empty list', () => Promise.resolve([])],
    ['an API failure', () => Promise.reject(new Error('Anthropic Models API responded 401'))],
  ])('falls back to the CLI alias probe on %s', async (_label, listApiModels) => {
    const listCliModels = vi.fn().mockResolvedValue(SAMPLE);
    const catalog = new ClaudeCodeModelCatalogService({ listApiModels, listCliModels });

    const ids = (await catalog.listModels()).map((l) => l.id);

    expect(listCliModels).toHaveBeenCalledTimes(1);
    expect(ids).toContain('claude-sonnet-5');
  });

  it('reports an API failure once, by status, before falling back', async () => {
    const catalog = new ClaudeCodeModelCatalogService({
      listApiModels: () => Promise.reject(new Error('Anthropic Models API responded 401')),
      listCliModels: vi.fn().mockResolvedValue(SAMPLE),
    });

    await catalog.listModels();

    const output = stderr.mock.calls.map((call: unknown[]) => String(call[0])).join('');
    expect(output).toContain('Anthropic Models API responded 401');
  });

  it('collapses a dated snapshot onto the undated catalog id, keeping the API name', async () => {
    const catalog = new ClaudeCodeModelCatalogService({
      listApiModels: vi.fn().mockResolvedValue([
        { id: 'claude-haiku-4-5-20251001', displayName: 'Haiku 4.5', vendor: 'anthropic' },
        { id: 'claude-3-haiku-20240307', displayName: 'Haiku 3', vendor: 'anthropic' },
      ]),
      listCliModels: vi.fn(),
    });

    const listings = await catalog.listModels();
    const ids = listings.map((l) => l.id);

    expect(ids).not.toContain('claude-haiku-4-5-20251001');
    expect(ids.filter((id) => id === 'claude-haiku-4-5')).toHaveLength(1);
    expect(listings.find((l) => l.id === 'claude-haiku-4-5')?.displayName).toBe('Haiku 4.5');
    // A snapshot with no undated catalog counterpart stays as served.
    expect(ids).toContain('claude-3-haiku-20240307');
  });
});
