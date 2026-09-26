/**
 * Settings Service
 *
 * Provides global access to application settings within the CLI.
 * Uses globalThis/process storage so the singleton survives Turbopack
 * module re-evaluations in Next.js API routes.
 *
 * Usage:
 * ```typescript
 * import { getSettings } from './infrastructure/services/settings.service.js';
 *
 * const settings = getSettings();
 * console.log(settings.models.default); // 'claude-opus-5-5'
 * ```
 */

import type { Settings } from '../../domain/generated/output.js';

/** The globalThis / process key for the settings singleton. */
const SHEP_SETTINGS_KEY = '__shepSettings';

/** Read the settings instance from globalThis, falling back to process. */
function readSettings(): Settings | null {
  const fromGlobal = (globalThis as Record<string, unknown>)[SHEP_SETTINGS_KEY];
  if (fromGlobal != null) return fromGlobal as Settings;

  const fromProcess = (process as unknown as Record<string, unknown>)[SHEP_SETTINGS_KEY];
  if (fromProcess != null) return fromProcess as Settings;

  return null;
}

/** Write the settings instance to both globalThis and process. */
function writeSettings(value: Settings | null): void {
  (globalThis as Record<string, unknown>)[SHEP_SETTINGS_KEY] = value;
  (process as unknown as Record<string, unknown>)[SHEP_SETTINGS_KEY] = value;
}

/**
 * Initialize the settings service with loaded settings.
 * Must be called once during CLI bootstrap.
 *
 * @param settings - The initialized settings
 * @throws Error if settings are already initialized
 */
export function initializeSettings(settings: Settings): void {
  if (readSettings() !== null) {
    throw new Error('Settings already initialized. Cannot re-initialize.');
  }

  writeSettings(settings);
}

/**
 * Get the current application settings.
 *
 * @returns Current settings instance
 * @throws Error if settings haven't been initialized yet
 *
 * @example
 * ```typescript
 * const settings = getSettings();
 * console.log(settings.system.logLevel); // 'info'
 * ```
 */
export function getSettings(): Settings {
  const instance = readSettings();
  if (instance === null) {
    throw new Error('Settings not initialized. Call initializeSettings() during CLI bootstrap.');
  }

  return instance;
}

/**
 * Check if settings have been initialized.
 *
 * @returns True if settings are initialized, false otherwise
 */
export function hasSettings(): boolean {
  return readSettings() !== null;
}

/**
 * Update the settings singleton with new values.
 * Used after a successful database write to refresh the in-memory
 * singleton so the rest of the application sees the updated values
 * without a full page reload.
 *
 * @param settings - The updated settings to store
 * @throws Error if settings haven't been initialized yet
 */
export function updateSettings(settings: Settings): void {
  if (readSettings() === null) {
    throw new Error('Settings not initialized. Cannot update before initialization.');
  }

  writeSettings(settings);
}

/**
 * Reset settings instance (for testing purposes only).
 * DO NOT use in production code.
 *
 * @internal
 */
export function resetSettings(): void {
  writeSettings(null);
}
