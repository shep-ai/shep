// @vitest-environment node

/**
 * detectDevScript Unit Tests
 *
 * Tests for the utility that reads package.json from a directory, detects
 * the best dev script, and identifies the package manager from lockfiles.
 * Includes subdirectory scanning fallback for monorepos / nested projects.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { detectDevScript } from '@/infrastructure/services/deployment/detect-dev-script.js';

const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockStatSync = vi.mocked(statSync);

describe('detectDevScript', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return correct result for directory with package.json containing dev script', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        scripts: { dev: 'next dev', build: 'next build' },
      })
    );
    mockExistsSync.mockImplementation((path) => String(path).endsWith('node_modules'));

    const result = detectDevScript('/project');

    expect(result).toEqual({
      success: true,
      packageManager: 'npm',
      scriptName: 'dev',
      command: 'npm run dev',
      needsInstall: false,
      resolvedDir: '/project',
    });
  });

  it('should detect pnpm from pnpm-lock.yaml presence', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        scripts: { dev: 'vite' },
      })
    );
    mockExistsSync.mockImplementation((path) => {
      const p = String(path);
      return p.endsWith('pnpm-lock.yaml') || p.endsWith('node_modules');
    });

    const result = detectDevScript('/project');

    expect(result).toEqual({
      success: true,
      packageManager: 'pnpm',
      scriptName: 'dev',
      command: 'pnpm dev',
      needsInstall: false,
      resolvedDir: '/project',
    });
  });

  it('should detect bun from bun.lock presence and use `bun run <script>`', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        scripts: { dev: 'vite' },
      })
    );
    mockExistsSync.mockImplementation((path) => {
      const p = String(path);
      return p.endsWith('bun.lock') || p.endsWith('node_modules');
    });

    const result = detectDevScript('/project');

    expect(result).toEqual({
      success: true,
      packageManager: 'bun',
      scriptName: 'dev',
      command: 'bun run dev',
      needsInstall: false,
      resolvedDir: '/project',
    });
  });

  it('should detect bun from legacy bun.lockb presence', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        scripts: { dev: 'vite' },
      })
    );
    mockExistsSync.mockImplementation((path) => {
      const p = String(path);
      return p.endsWith('bun.lockb') || p.endsWith('node_modules');
    });

    const result = detectDevScript('/project');

    expect(result.success && result.packageManager).toBe('bun');
    expect(result.success && result.command).toBe('bun run dev');
  });

  it('should detect yarn from yarn.lock presence', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        scripts: { dev: 'vite' },
      })
    );
    mockExistsSync.mockImplementation((path) => {
      const p = String(path);
      return p.endsWith('yarn.lock') || p.endsWith('node_modules');
    });

    const result = detectDevScript('/project');

    expect(result).toEqual({
      success: true,
      packageManager: 'yarn',
      scriptName: 'dev',
      command: 'yarn dev',
      needsInstall: false,
      resolvedDir: '/project',
    });
  });

  it('should fall back to start when dev is absent', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        scripts: { start: 'node server.js', build: 'tsc' },
      })
    );
    mockExistsSync.mockReturnValue(false);

    const result = detectDevScript('/project');

    expect(result).toEqual({
      success: true,
      packageManager: 'npm',
      scriptName: 'start',
      command: 'npm run start',
      needsInstall: true,
      resolvedDir: '/project',
    });
  });

  it('should fall back to serve when dev and start are absent', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        scripts: { serve: 'serve -s build', build: 'tsc' },
      })
    );
    mockExistsSync.mockReturnValue(false);

    const result = detectDevScript('/project');

    expect(result).toEqual({
      success: true,
      packageManager: 'npm',
      scriptName: 'serve',
      command: 'npm run serve',
      needsInstall: true,
      resolvedDir: '/project',
    });
  });

  it('should return error when no matching scripts exist', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        scripts: { build: 'tsc', test: 'vitest' },
      })
    );
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);

    const result = detectDevScript('/project');

    expect(result).toEqual({
      success: false,
      error: 'No dev script found in package.json. Expected one of: dev, start, serve',
    });
  });

  it('should return error when package.json has no scripts field', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        name: 'my-project',
      })
    );
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);

    const result = detectDevScript('/project');

    expect(result).toEqual({
      success: false,
      error: 'No dev script found in package.json. Expected one of: dev, start, serve',
    });
  });

  it('should return error when package.json is missing', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);

    const result = detectDevScript('/project');

    expect(result).toEqual({
      success: false,
      error: 'No package.json found in /project',
    });
  });

  it('should enforce script priority order: dev > start > serve', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        scripts: { serve: 'serve', start: 'node index.js', dev: 'vite' },
      })
    );
    mockExistsSync.mockReturnValue(false);

    const result = detectDevScript('/project');

    expect(result).toEqual({
      success: true,
      packageManager: 'npm',
      scriptName: 'dev',
      command: 'npm run dev',
      needsInstall: true,
      resolvedDir: '/project',
    });
  });

  it('should use pnpm scriptName directly (not pnpm run scriptName) for dev', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        scripts: { dev: 'vite' },
      })
    );
    mockExistsSync.mockImplementation((path) => {
      const p = String(path);
      return p.endsWith('pnpm-lock.yaml') || p.endsWith('node_modules');
    });

    const result = detectDevScript('/project');

    expect(result.success && result.command).toBe('pnpm dev');
  });

  it('should use yarn scriptName directly (not yarn run scriptName) for dev', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        scripts: { dev: 'vite' },
      })
    );
    mockExistsSync.mockImplementation((path) => {
      const p = String(path);
      return p.endsWith('yarn.lock') || p.endsWith('node_modules');
    });

    const result = detectDevScript('/project');

    expect(result.success && result.command).toBe('yarn dev');
  });

  it('should set needsInstall true when node_modules is missing', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        scripts: { dev: 'vite' },
      })
    );
    mockExistsSync.mockImplementation((path) => {
      const p = String(path);
      return p.endsWith('pnpm-lock.yaml'); // node_modules missing
    });

    const result = detectDevScript('/project');

    expect(result.success && result.needsInstall).toBe(true);
  });

  it('should prioritize bun over every other manager when lockfiles collide', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        scripts: { dev: 'vite' },
      })
    );
    mockExistsSync.mockReturnValue(true); // all lockfiles + node_modules exist

    const result = detectDevScript('/project');

    // Bun is first in priority so app-creation projects (which are all
    // scaffolded with `bunx shadcn`) always resolve to bun even if a
    // stale lockfile from another manager also happens to be present.
    expect(result.success && result.packageManager).toBe('bun');
  });

  it('should prioritize pnpm-lock.yaml over yarn.lock when bun is not present', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        scripts: { dev: 'vite' },
      })
    );
    mockExistsSync.mockImplementation((path) => {
      const p = String(path);
      // Simulate a project without bun lockfiles but with both pnpm + yarn.
      if (p.endsWith('bun.lock') || p.endsWith('bun.lockb')) return false;
      return true;
    });

    const result = detectDevScript('/project');

    expect(result.success && result.packageManager).toBe('pnpm');
  });

  describe('subdirectory scanning fallback', () => {
    it('should find dev script in a subdirectory when root has no package.json', () => {
      const sitePackageJson = JSON.stringify({
        scripts: { dev: 'next dev' },
      });

      mockReadFileSync.mockImplementation((filePath) => {
        const p = String(filePath);
        if (p === join('/worktree', 'package.json')) {
          throw new Error('ENOENT');
        }
        if (p === join('/worktree', 'site', 'package.json')) {
          return sitePackageJson;
        }
        throw new Error('ENOENT');
      });

      mockExistsSync.mockImplementation((path) => {
        const p = String(path);
        return p === join('/worktree', 'site', 'node_modules');
      });

      mockReaddirSync.mockReturnValue(['site', 'specs'] as unknown as ReturnType<
        typeof readdirSync
      >);

      mockStatSync.mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>);

      const result = detectDevScript('/worktree');

      expect(result).toEqual({
        success: true,
        packageManager: 'npm',
        scriptName: 'dev',
        command: 'npm run dev',
        needsInstall: false,
        resolvedDir: join('/worktree', 'site'),
      });
    });

    it('should skip hidden directories and node_modules during scan', () => {
      mockReadFileSync.mockImplementation((filePath) => {
        const p = String(filePath);
        if (p === join('/worktree', 'package.json')) {
          throw new Error('ENOENT');
        }
        if (p === join('/worktree', 'app', 'package.json')) {
          return JSON.stringify({ scripts: { dev: 'vite' } });
        }
        throw new Error('ENOENT');
      });

      mockExistsSync.mockReturnValue(false);

      mockReaddirSync.mockReturnValue([
        '.git',
        '.next',
        'node_modules',
        'app',
      ] as unknown as ReturnType<typeof readdirSync>);

      mockStatSync.mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>);

      const result = detectDevScript('/worktree');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.resolvedDir).toBe(join('/worktree', 'app'));
      }
    });

    it('should skip non-directory entries during subdirectory scan', () => {
      mockReadFileSync.mockImplementation((filePath) => {
        const p = String(filePath);
        if (p === join('/worktree', 'package.json')) {
          throw new Error('ENOENT');
        }
        if (p === join('/worktree', 'app', 'package.json')) {
          return JSON.stringify({ scripts: { dev: 'vite' } });
        }
        throw new Error('ENOENT');
      });

      mockExistsSync.mockReturnValue(false);

      mockReaddirSync.mockReturnValue(['README.md', 'app'] as unknown as ReturnType<
        typeof readdirSync
      >);

      mockStatSync.mockImplementation((path) => {
        const p = String(path);
        if (p.endsWith('README.md')) {
          return { isDirectory: () => false } as ReturnType<typeof statSync>;
        }
        return { isDirectory: () => true } as ReturnType<typeof statSync>;
      });

      const result = detectDevScript('/worktree');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.resolvedDir).toBe(join('/worktree', 'app'));
      }
    });

    it('should return error when no subdirectory has a dev script either', () => {
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      mockExistsSync.mockReturnValue(false);

      mockReaddirSync.mockReturnValue(['docs', 'specs'] as unknown as ReturnType<
        typeof readdirSync
      >);

      mockStatSync.mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>);

      const result = detectDevScript('/worktree');

      expect(result.success).toBe(false);
    });

    it('should detect package manager in the subdirectory context', () => {
      mockReadFileSync.mockImplementation((filePath) => {
        const p = String(filePath);
        if (p === join('/worktree', 'package.json')) {
          throw new Error('ENOENT');
        }
        if (p === join('/worktree', 'site', 'package.json')) {
          return JSON.stringify({ scripts: { dev: 'next dev' } });
        }
        throw new Error('ENOENT');
      });

      mockExistsSync.mockImplementation((path) => {
        const p = String(path);
        return (
          p === join('/worktree', 'site', 'package-lock.json') ||
          p === join('/worktree', 'site', 'node_modules')
        );
      });

      mockReaddirSync.mockReturnValue(['site'] as unknown as ReturnType<typeof readdirSync>);

      mockStatSync.mockReturnValue({ isDirectory: () => true } as ReturnType<typeof statSync>);

      const result = detectDevScript('/worktree');

      expect(result).toEqual({
        success: true,
        packageManager: 'npm',
        scriptName: 'dev',
        command: 'npm run dev',
        needsInstall: false,
        resolvedDir: join('/worktree', 'site'),
      });
    });
  });
});
