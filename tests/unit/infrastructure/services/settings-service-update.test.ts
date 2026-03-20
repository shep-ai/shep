/**
 * Settings Service updateSettings() Unit Tests
 *
 * Tests for the updateSettings function that refreshes the in-memory
 * settings singleton after a database write, bypassing the initialization guard.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initializeSettings,
  getSettings,
  resetSettings,
  updateSettings,
} from '@/infrastructure/services/settings.service.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';

describe('updateSettings', () => {
  beforeEach(() => {
    resetSettings();
  });

  it('should update the in-memory singleton after initialization', () => {
    // Arrange
    const initial = createDefaultSettings();
    initializeSettings(initial);
    expect(getSettings().system.logLevel).toBe('info');

    // Act
    const updated = { ...initial, system: { ...initial.system, logLevel: 'debug' } };
    updateSettings(updated);

    // Assert
    expect(getSettings().system.logLevel).toBe('debug');
  });

  it('should throw if settings have not been initialized', () => {
    // Arrange
    const settings = createDefaultSettings();

    // Act & Assert
    expect(() => updateSettings(settings)).toThrow(
      'Settings not initialized. Cannot update before initialization.'
    );
  });

  it('should allow multiple sequential updates', () => {
    // Arrange
    const initial = createDefaultSettings();
    initializeSettings(initial);

    // Act
    const update1 = { ...initial, system: { ...initial.system, logLevel: 'warn' } };
    updateSettings(update1);

    const update2 = { ...initial, system: { ...initial.system, logLevel: 'error' } };
    updateSettings(update2);

    // Assert
    expect(getSettings().system.logLevel).toBe('error');
  });

  it('should update featureFlags in the singleton', () => {
    // Arrange
    const initial = createDefaultSettings();
    initializeSettings(initial);
    expect(getSettings().featureFlags?.skills).toBe(false);

    // Act
    const updated = {
      ...initial,
      featureFlags: {
        skills: true,
        envDeploy: false,
        debug: true,
        githubImport: false,
        adoptBranch: false,
        gitRebaseSync: false,
        reactFileManager: false,
        coastsDevServer: false,
      },
    };
    updateSettings(updated);

    // Assert
    expect(getSettings().featureFlags?.skills).toBe(true);
    expect(getSettings().featureFlags?.debug).toBe(true);
  });
});
