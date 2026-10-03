/**
 * Agent Catalog Unit Tests
 *
 * The catalog is the single source of truth for per-agent facts. These tests
 * lock in the invariants that the old scattered tables violated — every
 * supported agent must be complete and internally consistent, and the tool ids
 * and binary names must match what the rest of the system actually uses.
 *
 * TDD Phase: RED-GREEN
 */

import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  AGENT_CATALOG,
  getAgentDescriptor,
  getModelsForAgent,
  isSupportedAgentType,
  listAgentDescriptors,
  listSupportedAgentTypes,
} from '@/domain/shared/agent-catalog.js';
import { AgentType } from '@/domain/generated/output.js';

const TOOLS_DIR = join(
  process.cwd(),
  'packages/core/src/infrastructure/services/tool-installer/tools'
);

describe('AGENT_CATALOG', () => {
  it('should describe every member of the AgentType enum', () => {
    const described = Object.keys(AGENT_CATALOG).sort();
    const declared = Object.values(AgentType).sort();

    expect(described).toEqual(declared);
  });

  it('should key every entry by its own type', () => {
    for (const [key, descriptor] of Object.entries(AGENT_CATALOG)) {
      expect(descriptor.type).toBe(key);
    }
  });

  it('should give every entry a non-empty label and description', () => {
    for (const descriptor of listAgentDescriptors()) {
      expect(descriptor.label.length).toBeGreaterThan(0);
      expect(descriptor.description.length).toBeGreaterThan(0);
    }
  });

  it('should give every entry a distinct sort order', () => {
    const orders = listAgentDescriptors().map((d) => d.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('should return descriptors in ascending order', () => {
    const orders = listAgentDescriptors().map((d) => d.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });
});

describe('per-kind invariants', () => {
  it('should give every supported CLI agent a binary and version args', () => {
    for (const descriptor of listAgentDescriptors()) {
      if (descriptor.kind !== 'cli' || !descriptor.supported) continue;
      expect(descriptor.binary, `${descriptor.type} binary`).toBeTruthy();
      expect(descriptor.versionArgs.length, `${descriptor.type} versionArgs`).toBeGreaterThan(0);
    }
  });

  it('should not give SDK or mock agents a binary', () => {
    for (const descriptor of listAgentDescriptors()) {
      if (descriptor.kind === 'cli') continue;
      expect(descriptor.binary, `${descriptor.type}`).toBeNull();
    }
  });

  it('should give every supported agent that is not the mock at least one model', () => {
    for (const descriptor of listAgentDescriptors()) {
      if (!descriptor.supported || descriptor.kind === 'mock') continue;
      expect(descriptor.models.length, `${descriptor.type} models`).toBeGreaterThan(0);
    }
  });

  it('should not list duplicate models for any agent', () => {
    for (const descriptor of listAgentDescriptors()) {
      expect(new Set(descriptor.models).size, `${descriptor.type}`).toBe(descriptor.models.length);
    }
  });
});

describe('tool installer alignment', () => {
  // Tool ids are derived from the JSON filename, so a toolId that names no
  // file silently reports the agent as "not installed" forever. Two entries
  // were wrong this way before the catalog existed.
  it('should reference only tool ids that exist in the tool catalogue', () => {
    const toolIds = readdirSync(TOOLS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));

    for (const descriptor of listAgentDescriptors()) {
      if (descriptor.toolId === null) continue;
      expect(toolIds, `${descriptor.type} toolId`).toContain(descriptor.toolId);
    }
  });
});

describe('known drift regressions', () => {
  it('should record the Cursor binary as cursor-agent, not cursor', () => {
    // `cursor` is the desktop editor; the CLI agent binary is `cursor-agent`.
    expect(AGENT_CATALOG[AgentType.Cursor].binary).toBe('cursor-agent');
  });

  it('should list the full live Cursor catalog (auto + composer-2.5, no obsolete ids)', () => {
    // Source of truth is AGENT_CATALOG — do not hardcode the full array here.
    const models = getModelsForAgent(AgentType.Cursor);
    const catalog = [...AGENT_CATALOG[AgentType.Cursor].models];

    expect(models).toEqual(catalog);
    expect(models[0]).toBe('auto');
    expect(models).toContain('composer-2.5');
    expect(models).toContain('composer-2.5-fast');
    expect(models).not.toContain('composer-1.5');
    expect(models).not.toContain('claude-opus-4-6');
    expect(models.length).toBeGreaterThan(50);
  });

  it('should describe codex-cli and llmproxy, which the auth table used to omit', () => {
    expect(getAgentDescriptor(AgentType.CodexCli)?.label).toBe('Codex CLI');
    expect(getAgentDescriptor(AgentType.LlmProxy)?.label).toBe('LLM Proxy');
  });

  it('should treat gemini-cli as supported, not coming soon', () => {
    expect(isSupportedAgentType(AgentType.GeminiCli)).toBe(true);
  });

  it('should treat aider and continue as unsupported', () => {
    expect(isSupportedAgentType(AgentType.Aider)).toBe(false);
    expect(isSupportedAgentType(AgentType.Continue)).toBe(false);
  });

  it('should exclude unsupported agents from the supported list', () => {
    const supported = listSupportedAgentTypes();
    expect(supported).not.toContain(AgentType.Aider);
    expect(supported).not.toContain(AgentType.Continue);
  });
});

describe('Kimi Code', () => {
  it('should be a supported CLI agent driven by the kimi binary', () => {
    const kimi = getAgentDescriptor(AgentType.KimiCode);

    expect(kimi?.supported).toBe(true);
    expect(kimi?.kind).toBe('cli');
    expect(kimi?.binary).toBe('kimi');
  });

  it('should offer current Kimi models and no discontinued ones', () => {
    const models = getModelsForAgent(AgentType.KimiCode);

    expect(models).toContain('kimi-k3');
    expect(models).toContain('kimi-k2.7-code');
    // The kimi-k2 series was discontinued 2026-05-25 and kimi-k2.5 on 2026-08-31.
    expect(models).not.toContain('kimi-k2');
    expect(models).not.toContain('kimi-k2.5');
  });
});

describe('lookup helpers', () => {
  it('should return undefined for a value outside the enum', () => {
    expect(getAgentDescriptor('not-an-agent')).toBeUndefined();
  });

  it('should report an unknown agent as unsupported', () => {
    expect(isSupportedAgentType('not-an-agent')).toBe(false);
  });

  it('should return an empty model list for an unknown agent', () => {
    expect(getModelsForAgent('not-an-agent')).toEqual([]);
  });

  it('should return a copy so callers cannot mutate the catalog', () => {
    const models = getModelsForAgent(AgentType.ClaudeCode);
    models.push('injected');

    expect(getModelsForAgent(AgentType.ClaudeCode)).not.toContain('injected');
  });
});

describe('isAgentOffered (spec 119)', () => {
  it('offers experimental agents only while the harness flag is on', async () => {
    const { isAgentOffered, getAgentDescriptor } = await import('@/domain/shared/agent-catalog.js');
    const harness = getAgentDescriptor('shep-harness')!;
    const claude = getAgentDescriptor('claude-code')!;
    expect(isAgentOffered(harness, { queryAwareHarness: false })).toBe(false);
    expect(isAgentOffered(harness, undefined)).toBe(false);
    expect(isAgentOffered(harness, { queryAwareHarness: true })).toBe(true);
    expect(isAgentOffered(claude, undefined)).toBe(true);
  });
});
