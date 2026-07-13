/**
 * TableFormatter Unit Tests
 *
 * Tests for the clean text-based settings display.
 */

import { describe, it, expect } from 'vitest';

import { TableFormatter } from '../../../../../src/presentation/cli/ui/tables.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';

describe('TableFormatter', () => {
  const sampleSettings = createDefaultSettings();

  describe('createSettingsTable()', () => {
    it('should return a string', () => {
      const result = TableFormatter.createSettingsTable(sampleSettings);

      expect(result).toBeTypeOf('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should include all settings sections', () => {
      const result = TableFormatter.createSettingsTable(sampleSettings);

      expect(result).toContain('Agent');
      expect(result).toContain('Environment');
      expect(result).not.toContain('\n  User\n');
      expect(result).not.toContain('\n  System\n');
    });

    it('should include model values', () => {
      const result = TableFormatter.createSettingsTable(sampleSettings);

      expect(result).toContain('claude-sonnet-5');
    });

    it('should show model under Agent section', () => {
      const result = TableFormatter.createSettingsTable(sampleSettings);

      expect(result).toContain('Model');
      expect(result).toContain('claude-sonnet-5');
    });

    it('should include agent configuration', () => {
      const result = TableFormatter.createSettingsTable(sampleSettings);

      expect(result).toContain('claude-code');
      expect(result).toContain('session');
    });

    it('should include database metadata when provided', () => {
      const dbMeta = { path: '/home/test/.shep/data', size: '152.0 KB' };
      const result = TableFormatter.createSettingsTable(sampleSettings, dbMeta);

      expect(result).toContain('Database');
      expect(result).toContain('/home/test/.shep/data');
      expect(result).toContain('152.0 KB');
    });

    it('should omit database section when not provided', () => {
      const result = TableFormatter.createSettingsTable(sampleSettings);

      expect(result).not.toContain('Database');
    });

    it('should mask token when present', () => {
      const settingsWithToken = {
        ...sampleSettings,
        agent: { ...sampleSettings.agent, token: 'sk-secret-key' },
      };
      const result = TableFormatter.createSettingsTable(settingsWithToken);

      expect(result).not.toContain('sk-secret-key');
      expect(result).toContain('••••••••');
    });
  });
});
