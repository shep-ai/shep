// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  TOOL_METADATA,
  type ToolMetadata,
} from '@/infrastructure/services/tool-installer/tool-metadata';

describe('ToolMetadata', () => {
  describe('TOOL_METADATA loading', () => {
    it('loads all IDE tools (those with openDirectory)', () => {
      const ideTools = Object.entries(TOOL_METADATA).filter(
        ([, meta]) => meta.openDirectory != null
      );
      expect(ideTools.length).toBeGreaterThanOrEqual(5);

      const ideKeys = ideTools.map(([key]) => key);
      expect(ideKeys).toContain('vscode');
      expect(ideKeys).toContain('cursor');
      expect(ideKeys).toContain('windsurf');
      expect(ideKeys).toContain('zed');
      expect(ideKeys).toContain('antigravity');
    });
  });

  describe('openDirectory {dir} placeholder', () => {
    it.each(['vscode', 'cursor', 'windsurf', 'zed'])(
      '%s has {dir} in openDirectory string',
      (editorId) => {
        const meta = TOOL_METADATA[editorId];
        expect(meta).toBeDefined();
        expect(typeof meta.openDirectory).toBe('string');
        expect(meta.openDirectory).toContain('{dir}');
      }
    );

    it('antigravity has per-platform openDirectory object with {dir}', () => {
      const meta = TOOL_METADATA['antigravity'];
      expect(meta).toBeDefined();
      expect(typeof meta.openDirectory).toBe('object');

      const openDir = meta.openDirectory as Record<string, string>;
      expect(openDir).toHaveProperty('linux');
      expect(openDir).toHaveProperty('darwin');
      expect(openDir['linux']).toContain('{dir}');
      expect(openDir['darwin']).toContain('{dir}');
      expect(openDir['linux']).toContain('antigravity');
      expect(openDir['darwin']).toContain('agy');
    });

    it('no IDE tool uses "." as directory placeholder', () => {
      const ideTools = Object.entries(TOOL_METADATA).filter(
        ([, meta]) => meta.openDirectory != null
      );

      for (const [key, meta] of ideTools) {
        if (typeof meta.openDirectory === 'string') {
          expect(meta.openDirectory, `${key} should not use "." placeholder`).not.toMatch(/\s\.$/);
        } else if (typeof meta.openDirectory === 'object') {
          for (const [platform, cmd] of Object.entries(
            meta.openDirectory as Record<string, string>
          )) {
            expect(cmd, `${key}.${platform} should not use "." placeholder`).not.toMatch(/\s\.$/);
          }
        }
      }
    });
  });

  describe('tags union', () => {
    it("accepts a descriptor tagged ['memory']", () => {
      const meta: ToolMetadata = {
        name: 'Memory Tool',
        summary: 'test',
        description: 'test',
        tags: ['memory'],
        binary: 'memory-tool',
        packageManager: 'pipx',
        commands: { linux: 'pipx install memory-tool' },
        timeout: 300000,
        documentationUrl: 'https://example.com',
        verifyCommand: 'memory-tool --version',
      };
      expect(meta.tags).toEqual(['memory']);
    });
  });

  describe('openDirectory type support', () => {
    it('accepts string format for openDirectory', () => {
      const meta: ToolMetadata = {
        name: 'Test IDE',
        summary: 'test',
        description: 'test',
        tags: ['ide'],
        binary: 'test',
        packageManager: 'manual',
        commands: { linux: 'echo test' },
        timeout: 30000,
        documentationUrl: 'https://example.com',
        verifyCommand: 'test --version',
        openDirectory: 'test {dir}',
      };
      expect(meta.openDirectory).toBe('test {dir}');
    });

    it('accepts Record<string, string> format for openDirectory', () => {
      const meta: ToolMetadata = {
        name: 'Test IDE',
        summary: 'test',
        description: 'test',
        tags: ['ide'],
        binary: 'test',
        packageManager: 'manual',
        commands: { linux: 'echo test' },
        timeout: 30000,
        documentationUrl: 'https://example.com',
        verifyCommand: 'test --version',
        openDirectory: {
          linux: 'test-linux {dir}',
          darwin: 'test-mac {dir}',
        },
      };
      expect(typeof meta.openDirectory).toBe('object');
      expect((meta.openDirectory as Record<string, string>)['linux']).toBe('test-linux {dir}');
    });
  });
});
