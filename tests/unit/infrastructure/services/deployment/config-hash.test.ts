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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
      'makefile',
      'GNUmakefile',
      'Cargo.toml',
      'Cargo.lock',
      'go.mod',
      'go.work',
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
      'mix.lock',
      'deno.json',
      'deno.jsonc',
      'deno.lock',
      '.shep/dev.json',
    ]);
  });

  it('covers every manifest the detector registry can key off', () => {
    // Detection coverage and cache invalidation must agree: a stack the
    // registry can detect but CONFIG_FILES does not fingerprint would never
    // re-analyze when its manifest changed.
    for (const manifest of [
      'Makefile',
      'docker-compose.yml',
      'pyproject.toml',
      'go.mod',
      'Cargo.toml',
      'deno.json',
      'Gemfile',
      'mix.exs',
      '.shep/dev.json',
    ]) {
      expect(CONFIG_FILES).toContain(manifest);
    }
  });
});

describe('LOCKFILES', () => {
  it('lists Node lockfiles FIRST, then the per-ecosystem install signals', () => {
    // Node-first is a compatibility requirement, not a preference: it keeps
    // computeInstallHash byte-identical for every repository shep runs today.
    expect(LOCKFILES).toEqual([
      'bun.lock',
      'bun.lockb',
      'pnpm-lock.yaml',
      'yarn.lock',
      'package-lock.json',
      'uv.lock',
      'poetry.lock',
      'Pipfile.lock',
      'requirements.txt',
      'Cargo.lock',
      'go.sum',
      'Gemfile.lock',
      'mix.lock',
      'deno.lock',
    ]);
  });

  it('keeps the Node lockfiles at the head, in their original order', () => {
    expect(LOCKFILES.slice(0, 5)).toEqual([
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

  it('changes when a committed .shep/dev.json is added, edited, or deleted', () => {
    // The repo-config override is read fresh on every start, so it never goes
    // stale itself — but DELETING it must invalidate the deterministic plan
    // that takes its place, which is what tracking it here buys.
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, 'package.json'), '{"name":"x"}');
      const without = computeConfigHash(dir);

      mkdirSync(join(dir, '.shep'), { recursive: true });
      writeFileSync(join(dir, '.shep', 'dev.json'), '{"command":"make dev"}');
      const added = computeConfigHash(dir);
      expect(added).not.toBe(without);

      writeFileSync(join(dir, '.shep', 'dev.json'), '{"command":"make serve"}');
      expect(computeConfigHash(dir)).not.toBe(added);

      rmSync(join(dir, '.shep'), { recursive: true, force: true });
      expect(computeConfigHash(dir)).toBe(without);
    } finally {
      cleanup(dir);
    }
  });

  it('hashes a Makefile exactly once regardless of filesystem case-sensitivity', () => {
    // CONFIG_FILES lists three Makefile spellings so the file is found on any
    // platform. On a case-insensitive filesystem all three existSync-hit the
    // same file, which must not contribute its bytes three times.
    const dir = makeTempDir();
    try {
      writeFileSync(join(dir, 'Makefile'), 'dev:\n\techo hi\n');
      const once = createHash('sha256')
        .update('Makefile')
        .update('\0')
        .update('dev:\n\techo hi\n')
        .update('\0')
        .digest('hex');

      expect(computeConfigHash(dir)).toBe(once);
    } finally {
      cleanup(dir);
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

  /**
   * Without these, `computeInstallHash` returns '' for any repo with no Node
   * lockfile and no package.json — and `isFresh` short-circuits an empty hash
   * to false, so every Go/Rust/Python/Elixir start would re-run its full
   * setupCommands list forever, stamping a hash that never matches.
   */
  describe('non-Node ecosystems', () => {
    const NON_NODE_LOCKFILES = [
      'uv.lock',
      'poetry.lock',
      'Pipfile.lock',
      'requirements.txt',
      'Cargo.lock',
      'go.sum',
      'Gemfile.lock',
      'mix.lock',
      'deno.lock',
    ];

    it.each(NON_NODE_LOCKFILES)(
      'returns a stable, non-empty hash for a repo with only %s',
      (lockfile) => {
        const dir = makeTempDir();
        try {
          writeFileSync(join(dir, lockfile), 'locked-content');
          const hash = computeInstallHash(dir);

          expect(hash).not.toBe('');
          expect(hash).toBe(createHash('sha256').update('locked-content').digest('hex'));
          expect(computeInstallHash(dir)).toBe(hash);
        } finally {
          cleanup(dir);
        }
      }
    );

    it.each(NON_NODE_LOCKFILES)('changes when %s content changes', (lockfile) => {
      const dir = makeTempDir();
      try {
        writeFileSync(join(dir, lockfile), 'v1');
        const before = computeInstallHash(dir);
        writeFileSync(join(dir, lockfile), 'v2');
        expect(computeInstallHash(dir)).not.toBe(before);
      } finally {
        cleanup(dir);
      }
    });

    it('still prefers a Node lockfile when both are present (no behaviour change for Node repos)', () => {
      const dir = makeTempDir();
      try {
        writeFileSync(join(dir, 'Cargo.lock'), 'cargo-content');
        writeFileSync(join(dir, 'go.sum'), 'go-content');
        writeFileSync(join(dir, 'pnpm-lock.yaml'), 'pnpm-content');

        expect(computeInstallHash(dir)).toBe(
          createHash('sha256').update('pnpm-content').digest('hex')
        );
      } finally {
        cleanup(dir);
      }
    });

    it('prefers a non-Node lockfile over the package.json fallback', () => {
      const dir = makeTempDir();
      try {
        writeFileSync(join(dir, 'package.json'), '{"name":"x"}');
        writeFileSync(join(dir, 'Cargo.lock'), 'cargo-content');

        expect(computeInstallHash(dir)).toBe(
          createHash('sha256').update('cargo-content').digest('hex')
        );
      } finally {
        cleanup(dir);
      }
    });
  });
});
