import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const PLUGIN_ROOT = resolve(__dirname, '../../../.claude-plugin');
const PLUGIN_MANIFEST_PATH = join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');
const MARKETPLACE_PATH = join(PLUGIN_ROOT, 'marketplace.json');

describe('plugin manifest (.claude-plugin/.claude-plugin/plugin.json)', () => {
  it('should exist at .claude-plugin/.claude-plugin/plugin.json', () => {
    expect(existsSync(PLUGIN_MANIFEST_PATH)).toBe(true);
  });

  describe('required fields', () => {
    it('should be valid JSON', () => {
      const content = readFileSync(PLUGIN_MANIFEST_PATH, 'utf-8');
      const manifest = JSON.parse(content);
      expect(manifest).toBeDefined();
    });

    it('should have a name field', () => {
      const content = readFileSync(PLUGIN_MANIFEST_PATH, 'utf-8');
      const manifest = JSON.parse(content);
      expect(manifest.name).toBeDefined();
      expect(typeof manifest.name).toBe('string');
      expect((manifest.name as string).length).toBeGreaterThan(0);
    });

    it('should have a semantic version', () => {
      const content = readFileSync(PLUGIN_MANIFEST_PATH, 'utf-8');
      const manifest = JSON.parse(content);
      expect(manifest.version).toBeDefined();
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it('should have a description', () => {
      const content = readFileSync(PLUGIN_MANIFEST_PATH, 'utf-8');
      const manifest = JSON.parse(content);
      expect(manifest.description).toBeDefined();
      expect(typeof manifest.description).toBe('string');
      expect((manifest.description as string).length).toBeGreaterThan(0);
    });

    it('should have description using value-focused language', () => {
      const content = readFileSync(PLUGIN_MANIFEST_PATH, 'utf-8');
      const manifest = JSON.parse(content);
      const description = manifest.description as string;
      expect(description.toLowerCase()).not.toContain(
        'agentic parallel development control center',
      );
      expect(description.toLowerCase()).not.toContain('ai native sdlc platform');
    });

    it('should have an author field', () => {
      const content = readFileSync(PLUGIN_MANIFEST_PATH, 'utf-8');
      const manifest = JSON.parse(content);
      expect(manifest.author).toBeDefined();
      expect(manifest.author.name).toBeDefined();
      expect(typeof manifest.author.name).toBe('string');
    });

    it('should have MIT license', () => {
      const content = readFileSync(PLUGIN_MANIFEST_PATH, 'utf-8');
      const manifest = JSON.parse(content);
      expect(manifest.license).toBe('MIT');
    });

    it('should reference skills directory', () => {
      const content = readFileSync(PLUGIN_MANIFEST_PATH, 'utf-8');
      const manifest = JSON.parse(content);
      expect(manifest.skills).toBeDefined();
      expect(typeof manifest.skills).toBe('string');
    });
  });

  describe('security constraints', () => {
    it('should not declare any MCP servers or hooks', () => {
      const content = readFileSync(PLUGIN_MANIFEST_PATH, 'utf-8');
      const manifest = JSON.parse(content);
      expect(manifest.mcpServers).toBeUndefined();
      expect(manifest.hooks).toBeUndefined();
    });
  });

  describe('skill files', () => {
    it('should have a SKILL.md for every skill directory', () => {
      const content = readFileSync(PLUGIN_MANIFEST_PATH, 'utf-8');
      const manifest = JSON.parse(content);
      const skillsPath = manifest.skills as string;
      const skillsDir = join(PLUGIN_ROOT, skillsPath);

      const expectedSkills = [
        'shep-intro',
        'architecture-reviewer',
        'mermaid-diagrams',
        'react-flow',
        'shadcn-ui',
        'vercel-react-best-practices',
        'tsp-model',
      ];

      for (const skill of expectedSkills) {
        const skillMdPath = join(skillsDir, skill, 'SKILL.md');
        expect(
          existsSync(skillMdPath),
          `Expected SKILL.md to exist at ${skillMdPath}`,
        ).toBe(true);
      }
    });

    it('should include at least 5 skills', () => {
      const expectedSkills = [
        'shep-intro',
        'architecture-reviewer',
        'mermaid-diagrams',
        'react-flow',
        'shadcn-ui',
        'vercel-react-best-practices',
        'tsp-model',
      ];
      expect(expectedSkills.length).toBeGreaterThanOrEqual(5);
    });
  });
});

describe('marketplace.json (.claude-plugin/marketplace.json)', () => {
  it('should exist at .claude-plugin/marketplace.json', () => {
    expect(existsSync(MARKETPLACE_PATH)).toBe(true);
  });

  it('should be valid JSON', () => {
    const content = readFileSync(MARKETPLACE_PATH, 'utf-8');
    const marketplace = JSON.parse(content);
    expect(marketplace).toBeDefined();
  });

  it('should have a name field', () => {
    const content = readFileSync(MARKETPLACE_PATH, 'utf-8');
    const marketplace = JSON.parse(content);
    expect(marketplace.name).toBeDefined();
    expect(typeof marketplace.name).toBe('string');
  });

  it('should have an owner with name', () => {
    const content = readFileSync(MARKETPLACE_PATH, 'utf-8');
    const marketplace = JSON.parse(content);
    expect(marketplace.owner).toBeDefined();
    expect(marketplace.owner.name).toBeDefined();
  });

  it('should have a plugins array with at least one entry', () => {
    const content = readFileSync(MARKETPLACE_PATH, 'utf-8');
    const marketplace = JSON.parse(content);
    expect(Array.isArray(marketplace.plugins)).toBe(true);
    expect(marketplace.plugins.length).toBeGreaterThanOrEqual(1);
  });

  it('should have each plugin entry with name, description, and source', () => {
    const content = readFileSync(MARKETPLACE_PATH, 'utf-8');
    const marketplace = JSON.parse(content);
    for (const entry of marketplace.plugins) {
      expect(entry.name).toBeDefined();
      expect(typeof entry.name).toBe('string');
      expect(entry.description).toBeDefined();
      expect(typeof entry.description).toBe('string');
      expect(entry.source).toBeDefined();
    }
  });

  it('should not declare any MCP servers or hooks in plugin entries', () => {
    const content = readFileSync(MARKETPLACE_PATH, 'utf-8');
    const marketplace = JSON.parse(content);
    for (const entry of marketplace.plugins) {
      expect(entry.mcpServers).toBeUndefined();
      expect(entry.hooks).toBeUndefined();
    }
  });
});
