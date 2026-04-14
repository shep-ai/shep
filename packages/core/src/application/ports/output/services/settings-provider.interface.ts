/**
 * Settings Provider (port)
 *
 * Read-only access to the global Shep settings for infrastructure
 * services that need to resolve agent config, auth method, or
 * concurrent-session caps without reaching into the singleton
 * directly. Replaces the `getSettings()` / `hasSettings()` module-level
 * accessors previously imported from infrastructure.
 */

import type { Settings } from '../../../../domain/generated/output.js';

export interface ISettingsProvider {
  /** Whether settings have been initialized (loaded from disk / DB). */
  has(): boolean;
  /** Returns the full resolved settings. Throws if `has()` is false. */
  get(): Settings;
}
