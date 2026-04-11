import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  createShimDirectory,
  buildFilteredPath,
} from '@/infrastructure/services/subprocess-filter/shim-generator.js';

describe('createShimDirectory', () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    for (const dir of createdDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // cleanup best-effort
      }
    }
    createdDirs.length = 0;
  });

  it('creates a temp directory with shim scripts for all commands', () => {
    const result = createShimDirectory('/fake/path/to/shep-filter.js');
    createdDirs.push(result.path);

    expect(existsSync(result.path)).toBe(true);
    expect(result.commands).toContain('git');
    expect(result.commands).toContain('npm');
    expect(result.commands).toContain('pnpm');
    expect(result.commands).toContain('yarn');
  });

  it('creates executable bash scripts for each command', () => {
    const result = createShimDirectory('/fake/path/to/shep-filter.js');
    createdDirs.push(result.path);

    for (const cmd of result.commands) {
      const shimPath = join(result.path, cmd);
      expect(existsSync(shimPath)).toBe(true);

      // Check executable permission (owner execute bit)
      const stat = statSync(shimPath);
      expect(stat.mode & 0o100).toBeTruthy();

      // Check content
      const content = readFileSync(shimPath, 'utf-8');
      expect(content).toContain('#!/usr/bin/env bash');
      expect(content).toContain('SHEP_FILTER_SHIM_DIR');
      expect(content).toContain('/fake/path/to/shep-filter.js');
      expect(content).toContain(`"${cmd}"`);
    }
  });
});

describe('buildFilteredPath', () => {
  it('prepends the shim directory to PATH', () => {
    const result = buildFilteredPath('/tmp/shep-shim', '/usr/bin:/usr/local/bin');
    expect(result).toBe('/tmp/shep-shim:/usr/bin:/usr/local/bin');
  });

  it('handles empty original PATH', () => {
    expect(buildFilteredPath('/tmp/shim', '')).toBe('/tmp/shim:');
  });
});
