import { describe, it, expect } from 'vitest';
import {
  AgentType,
  ChunkVisibility,
  HarnessMode,
  PermissionEffect,
} from '@/domain/generated/output.js';
import { DEFAULT_HARNESS_CONFIG, resolveHarnessConfig } from '@/domain/harness/harness-config.js';

describe('resolveHarnessConfig', () => {
  it('returns the documented defaults when nothing is stored', () => {
    const c = resolveHarnessConfig(undefined);
    expect(c).toEqual(DEFAULT_HARNESS_CONFIG);
    expect(c.mode).toBe(HarnessMode.QueryAware);
    expect(c.backendAgentType).toBe(AgentType.OpenRouter);
    expect(c.maxTurns).toBe(50);
    expect(c.context).toEqual({
      maxInputTokens: 64000,
      reserveOutputTokens: 8000,
      candidateLimit: 200,
      hideThreshold: 0.1,
      longThreshold: 0.45,
      fullThreshold: 0.8,
      uncertainDefault: ChunkVisibility.Long,
    });
    expect(c.decisions).toEqual({
      providers: [],
      routes: {},
      defaultProviderId: 'deterministic',
      fallbackProviderIds: [],
    });
    expect(c.permissions).toEqual({
      defaultUnknown: PermissionEffect.Ask,
      nonInteractiveAsk: PermissionEffect.Deny,
      approvalTimeoutMs: 1_800_000,
    });
  });

  it('merges nested partial values over defaults', () => {
    const c = resolveHarnessConfig({ context: { hideThreshold: 0.2 } as never, maxTurns: 10 });
    expect(c.maxTurns).toBe(10);
    expect(c.context.hideThreshold).toBe(0.2);
    expect(c.context.fullThreshold).toBe(0.8);
  });

  it('rejects inverted visibility bands by falling back to defaults', () => {
    const c = resolveHarnessConfig({
      context: { hideThreshold: 0.9, longThreshold: 0.5, fullThreshold: 0.3 } as never,
    });
    expect(c.context.hideThreshold).toBe(0.1);
    expect(c.context.longThreshold).toBe(0.45);
    expect(c.context.fullThreshold).toBe(0.8);
  });

  it('never shares mutable state with the defaults', () => {
    const c = resolveHarnessConfig(undefined);
    c.decisions.providers.push({ id: 'x', kind: 'reranker' as never });
    expect(DEFAULT_HARNESS_CONFIG.decisions.providers).toEqual([]);
  });
});
