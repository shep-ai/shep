/**
 * Plugin Catalog Unit Tests
 *
 * Tests for the curated plugin catalog that ships with Shep.
 * Verifies catalog entries, lookup functions, and data integrity.
 *
 * TDD Phase: RED-GREEN
 */

import { describe, it, expect } from 'vitest';
import {
  getCatalogEntries,
  getCatalogEntry,
} from '@/infrastructure/services/plugin/plugin-catalog.js';
import { PluginType, PluginTransport } from '@/domain/generated/output.js';

describe('Plugin Catalog', () => {
  describe('getCatalogEntries', () => {
    it('should return an array with at least 3 entries', () => {
      const entries = getCatalogEntries();
      expect(entries.length).toBeGreaterThanOrEqual(3);
    });

    it('should contain mempalace, token-optimizer, and ruflo', () => {
      const entries = getCatalogEntries();
      const names = entries.map((e) => e.name);
      expect(names).toContain('mempalace');
      expect(names).toContain('token-optimizer');
      expect(names).toContain('ruflo');
    });

    it('should return a new array on each call (not mutable reference)', () => {
      const a = getCatalogEntries();
      const b = getCatalogEntries();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('getCatalogEntry', () => {
    it('should return MemPalace entry with correct fields', () => {
      const entry = getCatalogEntry('mempalace');
      expect(entry).toBeDefined();
      expect(entry!.displayName).toBe('MemPalace');
      expect(entry!.type).toBe(PluginType.Mcp);
      expect(entry!.transport).toBe(PluginTransport.Stdio);
      expect(entry!.serverCommand).toBe('python');
      expect(entry!.serverArgs).toEqual(['-m', 'mempalace.mcp_server']);
      expect(entry!.runtimeType).toBe('python');
      expect(entry!.runtimeMinVersion).toBe('3.9');
      expect(entry!.requiredEnvVars).toEqual([]);
    });

    it('should return Token Optimizer entry with Hook type', () => {
      const entry = getCatalogEntry('token-optimizer');
      expect(entry).toBeDefined();
      expect(entry!.displayName).toBe('Token Optimizer');
      expect(entry!.type).toBe(PluginType.Hook);
      expect(entry!.runtimeType).toBe('python');
      expect(entry!.runtimeMinVersion).toBe('3.8');
    });

    it('should return Ruflo entry with MCP type and env vars', () => {
      const entry = getCatalogEntry('ruflo');
      expect(entry).toBeDefined();
      expect(entry!.displayName).toBe('Ruflo');
      expect(entry!.type).toBe(PluginType.Mcp);
      expect(entry!.transport).toBe(PluginTransport.Stdio);
      expect(entry!.serverCommand).toBe('npx');
      expect(entry!.serverArgs).toEqual(['ruflo@latest', 'mcp', 'start']);
      expect(entry!.runtimeType).toBe('node');
      expect(entry!.runtimeMinVersion).toBe('20');
      expect(entry!.requiredEnvVars).toContain('ANTHROPIC_API_KEY');
    });

    it('should return Ruflo with tool groups defined', () => {
      const entry = getCatalogEntry('ruflo');
      expect(entry).toBeDefined();
      expect(entry!.toolGroups).toBeDefined();
      expect(entry!.toolGroups!.length).toBeGreaterThan(0);
      const groupNames = entry!.toolGroups!.map((g) => g.name);
      expect(groupNames).toContain('implement');
    });

    it('should return undefined for nonexistent entry', () => {
      const entry = getCatalogEntry('nonexistent-plugin');
      expect(entry).toBeUndefined();
    });

    it('should have homepageUrl for all entries', () => {
      const entries = getCatalogEntries();
      for (const entry of entries) {
        expect(entry.homepageUrl).toBeDefined();
        expect(entry.homepageUrl.startsWith('https://')).toBe(true);
      }
    });

    it('should have description for all entries', () => {
      const entries = getCatalogEntries();
      for (const entry of entries) {
        expect(entry.description).toBeDefined();
        expect(entry.description.length).toBeGreaterThan(0);
      }
    });
  });
});
