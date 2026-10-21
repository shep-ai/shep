/**
 * CursorModelCatalogService Unit Tests
 *
 * Discovers models via `cursor-agent --list-models`. Boot may warm this cache;
 * spawn failures, timeouts, and parse errors must fall back to empty (factory
 * then serves the hardcoded CURSOR_MODELS list) rather than hanging or throwing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CursorModelCatalogService,
  createCursorListModels,
  parseCursorListModelsOutput,
} from '@/infrastructure/services/agents/common/model-catalogs/cursor-model-catalog.service.js';
import {
  MODEL_CATALOG_FETCH_TIMEOUT_MS,
  MODEL_CATALOG_TTL_MS,
} from '@/infrastructure/services/agents/common/model-catalogs/catalog-fetch.js';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'cursor-list-models.txt'), 'utf8');

describe('parseCursorListModelsOutput', () => {
  it('parses id - Display Name lines and skips the header', () => {
    const listings = parseCursorListModelsOutput(FIXTURE);

    expect(listings[0]).toEqual({
      id: 'auto',
      displayName: 'Auto (current, default)',
    });
    expect(listings.map((l) => l.id)).toEqual([
      'auto',
      'gpt-5.3-codex',
      'composer-2.5',
      'composer-2.5-fast',
      'claude-opus-5-thinking-high',
      'gpt-5.2',
      'grok-4.7-high',
    ]);
    expect(listings.find((l) => l.id === 'composer-2.5')?.displayName).toBe('Composer 2.5');
  });

  it('returns an empty list when output has no model lines', () => {
    expect(parseCursorListModelsOutput('Available models\n\n')).toEqual([]);
    expect(parseCursorListModelsOutput('')).toEqual([]);
  });

  it('ignores malformed lines without an id - name separator', () => {
    const listings = parseCursorListModelsOutput(
      'Available models\n\nauto - Auto\nnot-a-model-line\ncomposer-2.5 - Composer 2.5\n'
    );
    expect(listings.map((l) => l.id)).toEqual(['auto', 'composer-2.5']);
  });
});

describe('CursorModelCatalogService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists models from the injected runner and caches within the TTL', async () => {
    const run = vi.fn().mockResolvedValue(FIXTURE);
    const catalog = new CursorModelCatalogService(run);

    const first = await catalog.listModels();
    const second = await catalog.listModels();

    expect(first.map((l) => l.id)).toContain('auto');
    expect(first.map((l) => l.id)).toContain('composer-2.5');
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after the TTL expires', async () => {
    const run = vi.fn().mockResolvedValue(FIXTURE);
    const catalog = new CursorModelCatalogService(run);

    await catalog.listModels();
    await vi.advanceTimersByTimeAsync(MODEL_CATALOG_TTL_MS + 1);
    await catalog.listModels();

    expect(run).toHaveBeenCalledTimes(2);
  });

  it('returns an empty list when the runner fails and there is no cache', async () => {
    const run = vi.fn().mockRejectedValue(new Error('cursor-agent not found'));
    const catalog = new CursorModelCatalogService(run);

    await expect(catalog.listModels()).resolves.toEqual([]);
  });

  it('returns the last-good cache when a later fetch fails', async () => {
    const run = vi.fn().mockResolvedValueOnce(FIXTURE).mockRejectedValueOnce(new Error('timeout'));
    const catalog = new CursorModelCatalogService(run);

    const first = await catalog.listModels();
    await vi.advanceTimersByTimeAsync(MODEL_CATALOG_TTL_MS + 1);
    const second = await catalog.listModels();

    expect(second).toEqual(first);
    expect(second.map((l) => l.id)).toContain('composer-2.5');
  });

  it('returns an empty list when parse yields no models', async () => {
    const run = vi.fn().mockResolvedValue('Available models\n\n');
    const catalog = new CursorModelCatalogService(run);

    await expect(catalog.listModels()).resolves.toEqual([]);
  });
});

describe('createCursorListModels', () => {
  it('runs `cursor-agent --list-models` through the injected ExecFunction', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: FIXTURE, stderr: '' });

    await expect(createCursorListModels(exec)()).resolves.toBe(FIXTURE);
    expect(exec).toHaveBeenCalledWith(
      'cursor-agent',
      ['--list-models'],
      expect.objectContaining({ timeout: MODEL_CATALOG_FETCH_TIMEOUT_MS, windowsHide: true })
    );
  });
});
