import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import {
  resolveWebDirForElectron,
  type ResolveWebDirDeps,
} from '../../../packages/electron/src/resolve-web-dir.js';

function createDeps(overrides: Partial<ResolveWebDirDeps> = {}): ResolveWebDirDeps {
  return {
    isPackaged: false,
    resourcesPath: '/app/resources',
    existsSync: vi.fn(() => false),
    basedir: '/monorepo/packages/electron/src',
    ...overrides,
  };
}

describe('resolveWebDirForElectron', () => {
  describe('packaged mode (isPackaged = true)', () => {
    it('resolves from resourcesPath/web when .next directory exists', () => {
      const expectedCheck = path.join('/app/resources', 'web', '.next');
      const existsSync = vi.fn((p: unknown) => String(p) === expectedCheck);
      const deps = createDeps({ isPackaged: true, existsSync });

      const result = resolveWebDirForElectron(deps);

      expect(result.dir).toBe(path.join('/app/resources', 'web'));
      expect(result.dev).toBe(false);
    });

    it('throws when .next directory does not exist in resourcesPath', () => {
      const deps = createDeps({ isPackaged: true });

      expect(() => resolveWebDirForElectron(deps)).toThrow(
        'Web UI directory not found in packaged app'
      );
    });

    it('includes resourcesPath in the error message', () => {
      const deps = createDeps({
        isPackaged: true,
        resourcesPath: '/custom/resources',
      });

      expect(() => resolveWebDirForElectron(deps)).toThrow('/custom/resources');
    });
  });

  describe('development mode (isPackaged = false)', () => {
    it('resolves to dev web directory when next.config.ts exists', () => {
      const basedir = '/project/packages/electron/src';
      const expectedDir = path.resolve(basedir, '../../../src/presentation/web');
      const existsSync = vi.fn(
        (p: unknown) => String(p) === path.join(expectedDir, 'next.config.ts')
      );
      const deps = createDeps({ basedir, existsSync });

      const result = resolveWebDirForElectron(deps);

      expect(result.dir).toBe(expectedDir);
      expect(result.dev).toBe(true);
    });

    it('resolves production web directory when .next exists at monorepo root/web', () => {
      const basedir = '/project/packages/electron/src';
      const expectedDir = path.resolve(basedir, '../../../web');
      const existsSync = vi.fn((p: unknown) => {
        const s = String(p);
        // Dev path doesn't have next.config.ts
        if (s.endsWith('next.config.ts')) return false;
        // Production path has .next
        return s === path.join(expectedDir, '.next');
      });
      const deps = createDeps({ basedir, existsSync });

      const result = resolveWebDirForElectron(deps);

      expect(result.dir).toBe(expectedDir);
      expect(result.dev).toBe(false);
    });

    it('throws when no web directory is found', () => {
      const deps = createDeps();

      expect(() => resolveWebDirForElectron(deps)).toThrow('Web UI directory not found');
    });

    it('includes searched paths in the error message', () => {
      const deps = createDeps({ basedir: '/x/packages/electron/src' });

      try {
        resolveWebDirForElectron(deps);
        expect.unreachable('should have thrown');
      } catch (error) {
        const msg = (error as Error).message;
        expect(msg).toContain('dev:');
        expect(msg).toContain('prod:');
        expect(msg).toContain('basedir:');
      }
    });
  });

  describe('macOS vs Windows/Linux path handling', () => {
    it('correctly joins paths regardless of separator', () => {
      // This test verifies path.join handles cross-platform correctly
      const basedir = '/Users/dev/project/packages/electron/src';
      const existsSync = vi.fn((p: unknown) => String(p).endsWith('next.config.ts'));
      const deps = createDeps({ basedir, existsSync });

      const result = resolveWebDirForElectron(deps);

      expect(result.dir).toContain('src');
      expect(result.dir).toContain('presentation');
      expect(result.dir).toContain('web');
      expect(result.dev).toBe(true);
    });
  });
});
