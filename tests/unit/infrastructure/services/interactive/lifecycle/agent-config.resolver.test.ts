/**
 * AgentConfigResolver Unit Tests
 *
 * Verifies that the resolver correctly derives agent type, auth config,
 * and the concurrent-session cap from an injected ISettingsProvider —
 * replacing the prior direct `getSettings()` / `hasSettings()` calls.
 */

import { describe, it, expect } from 'vitest';

import { AgentConfigResolver } from '@/infrastructure/services/interactive/lifecycle/agent-config.resolver.js';
import type { ISettingsProvider } from '@/application/ports/output/services/settings-provider.interface.js';
import type { Settings } from '@/domain/generated/output.js';
import { AgentType, AgentAuthMethod } from '@/domain/generated/output.js';

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    agent: {
      type: AgentType.CodexCli,
      authMethod: AgentAuthMethod.Token,
    },
    interactiveAgent: {
      enabled: true,
      autoTimeoutMinutes: 15,
      maxConcurrentSessions: 7,
    },
    ...overrides,
  } as Settings;
}

class FakeSettingsProvider implements ISettingsProvider {
  constructor(private readonly settings: Settings | null) {}

  has(): boolean {
    return this.settings !== null;
  }

  get(): Settings {
    if (this.settings === null) {
      throw new Error('Settings not initialized');
    }
    return this.settings;
  }
}

describe('AgentConfigResolver', () => {
  describe('resolveAgentType', () => {
    it('returns the explicit override when provided, regardless of settings', () => {
      const resolver = new AgentConfigResolver(new FakeSettingsProvider(makeSettings()));
      expect(resolver.resolveAgentType(AgentType.ClaudeCode)).toBe(AgentType.ClaudeCode);
    });

    it('returns the settings.agent.type when no override is provided', () => {
      const resolver = new AgentConfigResolver(new FakeSettingsProvider(makeSettings()));
      expect(resolver.resolveAgentType()).toBe(AgentType.CodexCli);
    });

    it('falls back to ClaudeCode when settings are not initialized', () => {
      const resolver = new AgentConfigResolver(new FakeSettingsProvider(null));
      expect(resolver.resolveAgentType()).toBe(AgentType.ClaudeCode);
    });
  });

  describe('resolveAuthConfig', () => {
    it('returns the settings.agent config when settings are initialized', () => {
      const resolver = new AgentConfigResolver(new FakeSettingsProvider(makeSettings()));
      expect(resolver.resolveAuthConfig()).toEqual({
        type: AgentType.CodexCli,
        authMethod: AgentAuthMethod.Token,
      });
    });

    it('falls back to ClaudeCode + Session when settings are not initialized', () => {
      const resolver = new AgentConfigResolver(new FakeSettingsProvider(null));
      expect(resolver.resolveAuthConfig()).toEqual({
        type: AgentType.ClaudeCode,
        authMethod: AgentAuthMethod.Session,
      });
    });
  });

  describe('getCap', () => {
    it('returns interactiveAgent.maxConcurrentSessions when present', () => {
      const resolver = new AgentConfigResolver(new FakeSettingsProvider(makeSettings()));
      expect(resolver.getCap()).toBe(7);
    });

    it('falls back to DEFAULT_CAP=3 when interactiveAgent is missing', () => {
      const settings = makeSettings();
      delete (settings as { interactiveAgent?: unknown }).interactiveAgent;
      const resolver = new AgentConfigResolver(new FakeSettingsProvider(settings));
      expect(resolver.getCap()).toBe(3);
    });

    it('falls back to DEFAULT_CAP=3 when settings are not initialized', () => {
      const resolver = new AgentConfigResolver(new FakeSettingsProvider(null));
      expect(resolver.getCap()).toBe(3);
    });
  });
});
