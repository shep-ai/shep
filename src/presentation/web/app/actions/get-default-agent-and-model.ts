'use server';

import { getSettings, hasSettings } from '@shepai/core/infrastructure/services/settings.service';
import { createDefaultSettings } from '@shepai/core/domain/factories/settings-defaults.factory';

export interface DefaultAgentAndModel {
  agentType: string;
  model: string;
}

/**
 * Returns the user's currently-configured default agent type + model.
 *
 * This is the SINGLE source of truth for "which agent and model should
 * a freshly-opened picker / new application use by default?". Every
 * surface that needs to know the active default (empty-state composer,
 * ChatTab, feature-create drawer) MUST go through this action — never
 * hardcode a fallback like `'claude-code'` / `'claude-sonnet-4-6'`,
 * because that lies about what the system will actually use and lets
 * a stale settings value (e.g. demo `dev` agent) surface a misleading
 * "Claude Code" label in the UI while the real session boots with the
 * dev agent and dies on `createInteractiveExecutor`.
 *
 * Falls back to the values baked into `createDefaultSettings()` only
 * when settings haven't been initialised yet (fresh install before
 * onboarding). Those defaults already say `claude-code` /
 * `claude-sonnet-4-6` — same place, same source of truth.
 */
export async function getDefaultAgentAndModel(): Promise<DefaultAgentAndModel> {
  const settings = hasSettings() ? getSettings() : createDefaultSettings();
  return {
    agentType: settings.agent.type,
    model: settings.models.default,
  };
}
