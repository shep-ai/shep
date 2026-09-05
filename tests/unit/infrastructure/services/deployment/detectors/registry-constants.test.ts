// @vitest-environment node

/**
 * Detector Registry Constants Unit Tests
 *
 * `registry.ts` is the single documented home for detector precedence and its
 * shared limits (NFR-7: no magic values; NFR-1: bounded filesystem work).
 * These assertions pin the values other modules — and the plan's performance
 * budget — depend on.
 */

import { describe, it, expect } from 'vitest';
import {
  Ecosystem,
  SKIP_DIRS,
  isSkippedDir,
  MAX_MANIFEST_BYTES,
  MAX_SCANNED_SUBDIRS,
} from '@/infrastructure/services/deployment/detectors/registry.js';

describe('Ecosystem', () => {
  it('names every ecosystem the registry covers', () => {
    expect(Object.values(Ecosystem)).toEqual([
      'repo-config',
      'node',
      'deno',
      'make',
      'python',
      'go',
      'rust',
      'ruby',
      'elixir',
      'compose',
    ]);
  });
});

describe('SKIP_DIRS / isSkippedDir', () => {
  it('contains the documented non-project directory names', () => {
    for (const name of ['node_modules', '.git', '.next', 'dist', 'build', 'out', '.cache']) {
      expect(SKIP_DIRS.has(name)).toBe(true);
    }
  });

  it('skips every named directory', () => {
    for (const name of SKIP_DIRS) {
      expect(isSkippedDir(name)).toBe(true);
    }
  });

  it('skips ALL dot-directories, not just the named ones', () => {
    expect(isSkippedDir('.venv')).toBe(true);
    expect(isSkippedDir('.shep')).toBe(true);
    expect(isSkippedDir('.anything-at-all')).toBe(true);
  });

  it('does not skip ordinary project directories', () => {
    for (const name of ['apps', 'packages', 'site', 'services', 'src', 'web']) {
      expect(isSkippedDir(name)).toBe(false);
    }
  });
});

describe('bounded-work caps', () => {
  it('caps a single manifest read at 256 KB', () => {
    expect(MAX_MANIFEST_BYTES).toBe(256 * 1024);
  });

  it('caps the one-level subdirectory scan at 50 entries', () => {
    expect(MAX_SCANNED_SUBDIRS).toBe(50);
  });
});
