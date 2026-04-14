/**
 * SettingsProviderAdapter
 *
 * Thin infrastructure adapter that wraps the existing `settings.service`
 * module-level singleton behind the `ISettingsProvider` application port.
 * This is the SINGLE legitimate place the singleton may still be called —
 * infrastructure bootstrapping, the exception allowed by the
 * "No Singletons or Global State Outside Infrastructure Bootstrapping"
 * rule in `.claude/rules/code-quality.md`.
 *
 * Every other consumer (agent-config resolver, session bootstrapper, etc.)
 * must take an injected `ISettingsProvider` instead of importing
 * `getSettings` / `hasSettings` directly.
 */

import type { ISettingsProvider } from '../../../../application/ports/output/services/settings-provider.interface.js';
import type { Settings } from '../../../../domain/generated/output.js';
import { getSettings, hasSettings } from '../../settings.service.js';

export class SettingsProviderAdapter implements ISettingsProvider {
  has(): boolean {
    return hasSettings();
  }

  get(): Settings {
    return getSettings();
  }
}
