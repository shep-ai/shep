import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const PLUGIN_DIR = resolve(__dirname, '../../../.claude-plugin');
const PLUGIN_JSON_PATH = join(PLUGIN_DIR, 'plugin.json');

describe('plugin.json manifest', () => {
  it('should exist at .claude-plugin/plugin.json', () => {
    expect(existsSync(PLUGIN_JSON_PATH)).toBe(true);
  });

  describe('required fields', () => {
    it('should be valid JSON', () => {
      const content = readFileSync(PLUGIN_JSON_PATH, 'utf-8');
      const plugin = JSON.parse(content);
      expect(plugin).toBeDefined();
    });

    it('should have a name field', () => {
      const content = readFileSync(PLUGIN_JSON_PATH, 'utf-8');
      const plugin = JSON.parse(content);
      expect(plugin.name).toBeDefined();
      expect(typeof plugin.name).toBe('string');
      expect((plugin.name as string).length).toBeGreaterThan(0);
    });

    it('should have version set to 0.1.0', () => {
      const content = readFileSync(PLUGIN_JSON_PATH, 'utf-8');
      const plugin = JSON.parse(content);
      expect(plugin.version).toBe('0.1.0');
    });

    it('should have a description in metadata', () => {
      const content = readFileSync(PLUGIN_JSON_PATH, 'utf-8');
      const plugin = JSON.parse(content);
      const metadata = plugin.metadata as Record<string, unknown>;
      expect(metadata).toBeDefined();
      expect(metadata.description).toBeDefined();
      expect(typeof metadata.description).toBe('string');
      expect((metadata.description as string).length).toBeGreaterThan(0);
    });

    it('should have description matching value-focused positioning', () => {
      const content = readFileSync(PLUGIN_JSON_PATH, 'utf-8');
      const plugin = JSON.parse(content);
      const metadata = plugin.metadata as Record<string, unknown>;
      const description = metadata.description as string;
      // Must not use architecture-focused language
      expect(description.toLowerCase()).not.toContain(
        'agentic parallel development control center'
      );
      expect(description.toLowerCase()).not.toContain('ai native sdlc platform');
    });

    it('should have an owner field with name and email', () => {
      const content = readFileSync(PLUGIN_JSON_PATH, 'utf-8');
      const plugin = JSON.parse(content);
      expect(plugin.owner).toBeDefined();
      const owner = plugin.owner as Record<string, unknown>;
      expect(owner.name).toBeDefined();
      expect(typeof owner.name).toBe('string');
      expect(owner.email).toBeDefined();
      expect(typeof owner.email).toBe('string');
    });
  });

  describe('plugins array', () => {
    it('should have a plugins array with at least one entry', () => {
      const content = readFileSync(PLUGIN_JSON_PATH, 'utf-8');
      const plugin = JSON.parse(content);
      expect(Array.isArray(plugin.plugins)).toBe(true);
      expect((plugin.plugins as unknown[]).length).toBeGreaterThanOrEqual(1);
    });

    it('should have each plugin entry with name, description, and skills', () => {
      const content = readFileSync(PLUGIN_JSON_PATH, 'utf-8');
      const manifest = JSON.parse(content);
      for (const entry of manifest.plugins as Record<string, unknown>[]) {
        expect(entry.name).toBeDefined();
        expect(typeof entry.name).toBe('string');
        expect(entry.description).toBeDefined();
        expect(typeof entry.description).toBe('string');
        expect(Array.isArray(entry.skills)).toBe(true);
        expect((entry.skills as unknown[]).length).toBeGreaterThan(0);
      }
    });

    it('should not declare any MCP servers or hooks', () => {
      const content = readFileSync(PLUGIN_JSON_PATH, 'utf-8');
      const plugin = JSON.parse(content);
      // Instruction-only plugin — no executable components
      expect(plugin.mcpServers).toBeUndefined();
      expect(plugin.hooks).toBeUndefined();
      for (const entry of plugin.plugins as Record<string, unknown>[]) {
        expect(entry.mcpServers).toBeUndefined();
        expect(entry.hooks).toBeUndefined();
      }
    });
  });

  describe('skill file references', () => {
    it('should have a SKILL.md file for every skill referenced in plugins', () => {
      const content = readFileSync(PLUGIN_JSON_PATH, 'utf-8');
      const manifest = JSON.parse(content);

      for (const entry of manifest.plugins as Record<string, unknown>[]) {
        const skills = entry.skills as string[];
        for (const skillPath of skills) {
          const skillMdPath = join(PLUGIN_DIR, skillPath, 'SKILL.md');
          expect(
            existsSync(skillMdPath),
            `Expected SKILL.md to exist at ${skillMdPath} for skill reference "${skillPath}"`
          ).toBe(true);
        }
      }
    });

    it('should reference at least 5 skills (curated subset)', () => {
      const content = readFileSync(PLUGIN_JSON_PATH, 'utf-8');
      const manifest = JSON.parse(content);

      let totalSkills = 0;
      for (const entry of manifest.plugins as Record<string, unknown>[]) {
        totalSkills += (entry.skills as unknown[]).length;
      }
      expect(totalSkills).toBeGreaterThanOrEqual(5);
    });

    it('should include the shep-intro skill', () => {
      const content = readFileSync(PLUGIN_JSON_PATH, 'utf-8');
      const manifest = JSON.parse(content);

      const allSkills: string[] = [];
      for (const entry of manifest.plugins as Record<string, unknown>[]) {
        allSkills.push(...(entry.skills as string[]));
      }
      const hasShepIntro = allSkills.some((s) => s.includes('shep-intro'));
      expect(hasShepIntro).toBe(true);
    });
  });
});
