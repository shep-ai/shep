// @vitest-environment node

/**
 * config-hash Unit Tests
 *
 * Deterministic sha256 hashing over a sorted, fixed inventory of config
 * files — used for install-cache invalidation and staleness detection.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CONFIG_FILES,
  LOCKFILES,
  computeConfigHash,
  computeInstallHash,
} from '@/infrastructure/services/deployment/config-hash.js';

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'shep-config-hash-'));
}

function cleanup(...dirs: string[]): void {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('CONFIG_FILES', () => {
  it('contains exactly the expected filenames, in the documented order', () => {
    expect(CONFIG_FILES).toEqual([
      'package.json',
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      'bun.lock',
      'bun.lockb',
      'docker-compose.yml',
      'docker-compose.yaml',
      'Dockerfile',
      'Makefile',
      'Cargo.toml',
      'Cargo.lock',
      'go.mod',
      'go.sum',
      'requirements.txt',
      'Pipfile',
      'Pipfile.lock',
      'pyproject.toml',
      'poetry.lock',
      'uv.lock',
      'setup.py',
      'Gemfile',
      'Gemfile.lock',
      'build.gradle',
      'pom.xml',
      'mix.exs',
      'deno.json',
    ]);
  });
});

describe('LOCKFILES', () => {
  it('lists lockfiles in priority order', () => {
    expect(LOCKFILES).toEqual([
      'bun.lock',
      'bun.lockb',
      'pnpm-lock.yaml',
      'yarn.lock',
      'package-lock.json',
    ]);
  });
});

describe('computeConfigHash', () => {
  it('returns the sha256 of empty input for a directory with no config files', () => {
    const dir = makeTempDir();
    try {
      expect(computeConfigHash(dir)).toBe(EMPTY_SHA256);
    } finally {
      cleanup(dir);
    }
  });

  it('is deterministic across repeated calls for the same content', () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, 'package.json'), '{"name":"x"}');
      writeFileSync(join(dir, 'Dockerfile'), 'FROM node:20');
      expect(computeConfigHash(dir)).toBe(computeConfigHash(dir));
    } finally {
      cleanup(dir);
    }
  });

  it('changes when any tracked config file content changes', () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, 'package.json'), '{"name":"x"}');
      const before = computeConfigHash(dir);
      writeFileSync(join(dir, 'package.json'), '{"name":"y"}');
      const after = computeConfigHash(dir);
      expect(before).not.toBe(after);
    } finally {
      cleanup(dir);
    }
  });

  it('skips missing files without throwing and without affecting the hash', () => {
    const dirA = makeTempDir();
    const dirB = makeTempDir();
    try {
      writeFileSync(join(dirA, 'package.json'), '{"name":"x"}');

      writeFileSync(join(dirB, 'package.json'), '{"name":"x"}');
      writeFileSync(join(dirB, 'not-a-tracked-file.txt'), 'irrelevant content');

      expect(computeConfigHash(dirA)).toBe(computeConfigHash(dirB));
    } finally {
      cleanup(dirA, dirB);
    }
  });

  it('is independent of the order the files were created on disk (sorted filename order)', () => {
    const dirA = makeTempDir();
    const dirB = makeTempDir();
    try {
      writeFileSync(join(dirA, 'package.json'), 'A');
      writeFileSync(join(dirA, 'Dockerfile'), 'B');
      writeFileSync(join(dirA, 'go.mod'), 'C');

      writeFileSync(join(dirB, 'go.mod'), 'C');
      writeFileSync(join(dirB, 'Dockerfile'), 'B');
      writeFileSync(join(dirB, 'package.json'), 'A');

      expect(computeConfigHash(dirA)).toBe(computeConfigHash(dirB));
    } finally {
      cleanup(dirA, dirB);
    }
  });

  it('is sensitive to which set of tracked files exists (not just their contents)', () => {
    const dirA = makeTempDir();
    const dirB = makeTempDir();
    try {
      writeFileSync(join(dirA, 'package.json'), 'same-content');
      writeFileSync(join(dirB, 'package.json'), 'same-content');
      writeFileSync(join(dirB, 'go.mod'), 'extra-tracked-file');

      expect(computeConfigHash(dirA)).not.toBe(computeConfigHash(dirB));
    } finally {
      cleanup(dirA, dirB);
    }
  });
});

describe('computeInstallHash', () => {
  it('returns "" when neither a lockfile nor package.json exists', () => {
    const dir = makeTempDir();
    try {
      expect(computeInstallHash(dir)).toBe('');
    } finally {
      cleanup(dir);
    }
  });

  it('falls back to hashing package.json when no lockfile is present', () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, 'package.json'), '{"name":"x"}');
      const expected = createHash('sha256').update('{"name":"x"}').digest('hex');
      expect(computeInstallHash(dir)).toBe(expected);
    } finally {
      cleanup(dir);
    }
  });

  it('prefers a lockfile over package.json when both exist', () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, 'package.json'), '{"name":"x"}');
      writeFileSync(join(dir, 'package-lock.json'), 'lockfile-content');
      const expected = createHash('sha256').update('lockfile-content').digest('hex');
      expect(computeInstallHash(dir)).toBe(expected);
    } finally {
      cleanup(dir);
    }
  });

  it('honors lockfile priority order (bun.lock before pnpm/yarn/npm)', () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, 'yarn.lock'), 'yarn-content');
      writeFileSync(join(dir, 'pnpm-lock.yaml'), 'pnpm-content');
      writeFileSync(join(dir, 'bun.lock'), 'bun-content');
      const expected = createHash('sha256').update('bun-content').digest('hex');
      expect(computeInstallHash(dir)).toBe(expected);
    } finally {
      cleanup(dir);
    }
  });

  it('changes when the winning lockfile content changes', () => {
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, 'pnpm-lock.yaml'), 'v1');
      const before = computeInstallHash(dir);
      writeFileSync(join(dir, 'pnpm-lock.yaml'), 'v2');
      const after = computeInstallHash(dir);
      expect(before).not.toBe(after);
    } finally {
      cleanup(dir);
    }
  });
});
