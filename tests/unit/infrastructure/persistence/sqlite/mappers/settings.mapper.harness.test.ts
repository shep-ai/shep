/**
 * Settings mapper — query-aware harness columns (spec 119, migration 151).
 */
import { describe, it, expect } from 'vitest';
import {
  fromDatabase,
  toDatabase,
} from '@/infrastructure/persistence/sqlite/mappers/settings.mapper.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import { ChunkVisibility, HarnessMode, DecisionProviderKind } from '@/domain/generated/output.js';
import { resolveHarnessConfig } from '@/domain/harness/harness-config.js';

describe('settings mapper — harness', () => {
  it('writes the flag as 0 by default and reads it back as false', () => {
    const row = toDatabase(createDefaultSettings());
    expect(row.feature_flag_query_aware_harness).toBe(0);
    expect(row.harness_config).toBeNull();
    const settings = fromDatabase(row);
    expect(settings.featureFlags?.queryAwareHarness).toBe(false);
    expect(settings.harness).toBeUndefined();
  });

  it('round-trips the flag and a configured harness', () => {
    const base = createDefaultSettings();
    const harness = resolveHarnessConfig({
      mode: HarnessMode.Baseline,
      decisions: {
        providers: [
          {
            id: 'local-reranker',
            kind: DecisionProviderKind.Reranker,
            endpoint: 'http://localhost:8080/rerank',
            model: 'BAAI/bge-reranker-v2-m3',
          },
        ],
        routes: { chunkVisibility: 'local-reranker' },
        defaultProviderId: 'deterministic',
        fallbackProviderIds: [],
      },
    });
    const settings = {
      ...base,
      featureFlags: { ...base.featureFlags!, queryAwareHarness: true },
      harness,
    };
    const row = toDatabase(settings);
    expect(row.feature_flag_query_aware_harness).toBe(1);
    const back = fromDatabase(row);
    expect(back.featureFlags?.queryAwareHarness).toBe(true);
    expect(back.harness).toEqual(harness);
  });

  it('normalizes a partial stored JSON value through resolveHarnessConfig', () => {
    const row = {
      ...toDatabase(createDefaultSettings()),
      harness_config: JSON.stringify({ maxTurns: 7 }),
    };
    const back = fromDatabase(row);
    expect(back.harness?.maxTurns).toBe(7);
    expect(back.harness?.context.uncertainDefault).toBe(ChunkVisibility.Long);
  });

  it('reads unparseable JSON as unset instead of throwing', () => {
    const row = { ...toDatabase(createDefaultSettings()), harness_config: '{not json' };
    expect(fromDatabase(row).harness).toBeUndefined();
  });
});
