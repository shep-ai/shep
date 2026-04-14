/**
 * AgentConfigResolver
 *
 * Resolves the concrete agent type, auth config, and concurrent-session
 * cap for a pending interactive session. Consults the global Shep
 * settings via an injected `ISettingsProvider` so this collaborator
 * never calls the `settings.service` singleton directly — removing the
 * clean-architecture violation where the monolithic
 * `InteractiveSessionService` imported `getSettings` / `hasSettings`
 * from infrastructure.
 *
 * Extracted from `interactive-session.service.ts` in phase 3 of the
 * strangler refactor documented at
 * `docs/plans/2026-04-14-interactive-session-service-refactor.md`.
 */

import type { ISettingsProvider } from '../../../../application/ports/output/services/settings-provider.interface.js';
import type { AgentConfig } from '../../../../domain/generated/output.js';
import { AgentType, AgentAuthMethod } from '../../../../domain/generated/output.js';

/** Default concurrent session cap when settings are absent or missing the override. */
export const DEFAULT_CAP = 3;

export class AgentConfigResolver {
  constructor(private readonly settingsProvider: ISettingsProvider) {}

  /** Resolve the agent type from an explicit override or settings. */
  resolveAgentType(agentTypeOverride?: string): AgentType {
    if (agentTypeOverride) {
      return agentTypeOverride as AgentType;
    }
    if (this.settingsProvider.has()) {
      return this.settingsProvider.get().agent.type;
    }
    return AgentType.ClaudeCode;
  }

  /** Resolve the auth config from settings, with a safe fallback. */
  resolveAuthConfig(): AgentConfig {
    if (this.settingsProvider.has()) {
      return this.settingsProvider.get().agent;
    }
    // Fallback for when settings haven't been initialized yet
    return {
      type: AgentType.ClaudeCode,
      authMethod: AgentAuthMethod.Session,
    };
  }

  /** Read the concurrent session cap from settings or fall back to default. */
  getCap(): number {
    if (!this.settingsProvider.has()) return DEFAULT_CAP;
    const settings = this.settingsProvider.get();
    return settings.interactiveAgent?.maxConcurrentSessions ?? DEFAULT_CAP;
  }
}
