// @vitest-environment node

/**
 * `.shep/dev.json` reader + repo-config detector Unit Tests
 *
 * This file is untrusted input that arrives via `git pull`, so the interesting
 * cases are all the ways it can be wrong: it must never throw, never run a
 * command from a directory outside the repository, and never cost the user
 * their whole override because one optional field is bad.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectRepoConfig } from '@/infrastructure/services/deployment/detectors/repo-config.detector.js';
import { readRepoDevConfig } from '@/infrastructure/services/deployment/repo-dev-config-reader.js';
import {
  cleanupFixtures,
  makeFixture,
  normalizePath,
} from '@tests/helpers/detector-fixture.helper.js';

const CONFIG = '.shep/dev.json';

/** Write `.shep/dev.json` into an existing fixture (for paths known only after creation). */
function writeConfig(root: string, document: Record<string, unknown>): void {
  mkdirSync(join(root, '.shep'), { recursive: true });
  writeFileSync(join(root, '.shep', 'dev.json'), JSON.stringify(document), 'utf-8');
}

afterEach(() => cleanupFixtures());

describe('readRepoDevConfig — valid documents', () => {
  it('reads every supported field', () => {
    const dir = makeFixture(
      'cfg-full',
      {
        [CONFIG]: JSON.stringify({
          command: 'make dev',
          cwd: 'services/api',
          expectedPort: 8080,
          language: 'Go',
          framework: 'Echo',
          packageManager: 'go',
          setupCommands: ['go mod download'],
        }),
      },
      ['services/api']
    );

    const config = readRepoDevConfig(dir);

    expect(config).toMatchObject({
      command: 'make dev',
      expectedPort: 8080,
      language: 'Go',
      framework: 'Echo',
      packageManager: 'go',
      setupCommands: ['go mod download'],
    });
    expect(normalizePath(config?.cwd ?? '')).toBe(normalizePath(join(dir, 'services', 'api')));
  });

  it('defaults cwd to the repository root', () => {
    const dir = makeFixture('cfg-nocwd', { [CONFIG]: JSON.stringify({ command: 'make dev' }) });

    expect(normalizePath(readRepoDevConfig(dir)?.cwd ?? '')).toBe(normalizePath(dir));
  });

  it('ignores unknown keys', () => {
    const dir = makeFixture('cfg-unknown', {
      [CONFIG]: JSON.stringify({ command: 'make dev', somethingElse: 42 }),
    });

    expect(readRepoDevConfig(dir)).toMatchObject({ command: 'make dev' });
  });

  it('trims the command', () => {
    const dir = makeFixture('cfg-trim', { [CONFIG]: JSON.stringify({ command: '  make dev  ' }) });

    expect(readRepoDevConfig(dir)).toMatchObject({ command: 'make dev' });
  });

  it('accepts a comment-carrying JSONC document', () => {
    const dir = makeFixture('cfg-jsonc', {
      [CONFIG]: '{\n  // what to run\n  "command": "make dev"\n}\n',
    });

    expect(readRepoDevConfig(dir)).toMatchObject({ command: 'make dev' });
  });
});

describe('readRepoDevConfig — invalid documents fall through', () => {
  const invalid: [string, string | undefined][] = [
    ['a missing file', undefined],
    ['an empty file', ''],
    ['a non-JSON file', 'not json at all'],
    ['a JSON array', '[{"command":"make dev"}]'],
    ['a JSON scalar', '"make dev"'],
    ['a non-string command', JSON.stringify({ command: 42 })],
    ['an empty command', JSON.stringify({ command: '' })],
    ['a whitespace-only command', JSON.stringify({ command: '   ' })],
    ['a missing command', JSON.stringify({ cwd: '.' })],
  ];

  for (const [label, contents] of invalid) {
    it(`returns null for ${label} without throwing`, () => {
      const dir =
        contents === undefined
          ? makeFixture('cfg-invalid')
          : makeFixture('cfg-invalid', { [CONFIG]: contents });

      expect(() => readRepoDevConfig(dir)).not.toThrow();
      expect(readRepoDevConfig(dir)).toBeNull();
    });
  }
});

describe('readRepoDevConfig — expectedPort validation', () => {
  const dropped = [0, 65536, -1, 3000.5, '3000', null];

  for (const value of dropped) {
    it(`drops expectedPort ${JSON.stringify(value)} but keeps the rest of the file`, () => {
      const dir = makeFixture('cfg-port', {
        [CONFIG]: JSON.stringify({ command: 'make dev', expectedPort: value }),
      });

      const config = readRepoDevConfig(dir);

      expect(config).toMatchObject({ command: 'make dev' });
      expect(config?.expectedPort).toBeUndefined();
    });
  }

  it('accepts the boundary ports', () => {
    const low = makeFixture('cfg-port-min', {
      [CONFIG]: JSON.stringify({ command: 'x', expectedPort: 1 }),
    });
    const high = makeFixture('cfg-port-max', {
      [CONFIG]: JSON.stringify({ command: 'x', expectedPort: 65535 }),
    });

    expect(readRepoDevConfig(low)?.expectedPort).toBe(1);
    expect(readRepoDevConfig(high)?.expectedPort).toBe(65535);
  });
});

describe('readRepoDevConfig — setupCommands validation', () => {
  it('drops entries that are not non-empty strings', () => {
    const dir = makeFixture('cfg-setup', {
      [CONFIG]: JSON.stringify({
        command: 'make dev',
        setupCommands: ['go mod download', '', 42, null, '  '],
      }),
    });

    expect(readRepoDevConfig(dir)?.setupCommands).toEqual(['go mod download']);
  });

  it('defaults to an empty list when setupCommands is not an array', () => {
    const dir = makeFixture('cfg-setup-bad', {
      [CONFIG]: JSON.stringify({ command: 'make dev', setupCommands: 'go mod download' }),
    });

    expect(readRepoDevConfig(dir)?.setupCommands).toEqual([]);
  });
});

describe('readRepoDevConfig — cwd confinement', () => {
  it('rejects a cwd that escapes via ..', () => {
    const dir = makeFixture('cfg-escape', {
      [CONFIG]: JSON.stringify({ command: 'make dev', cwd: '../elsewhere' }),
    });

    expect(readRepoDevConfig(dir)).toBeNull();
  });

  it('rejects a sibling directory that merely shares the repo path prefix', () => {
    const repo = makeFixture('cfg-prefix');
    // `${repo}-evil` starts with `${repo}` — a bare startsWith would accept it.
    const evil = `${repo}-evil`;
    mkdirSync(evil, { recursive: true });
    writeConfig(repo, { command: 'make dev', cwd: evil });

    try {
      expect(readRepoDevConfig(repo)).toBeNull();
    } finally {
      rmSync(evil, { recursive: true, force: true });
    }
  });

  it('rejects a symlinked cwd pointing outside the repository', () => {
    const outside = makeFixture('cfg-outside');
    const dir = makeFixture('cfg-symlink', {
      [CONFIG]: JSON.stringify({ command: 'make dev', cwd: 'escape' }),
    });
    symlinkSync(outside, join(dir, 'escape'), 'dir');

    expect(readRepoDevConfig(dir)).toBeNull();
  });

  it('rejects a cwd that does not exist', () => {
    const dir = makeFixture('cfg-nodir', {
      [CONFIG]: JSON.stringify({ command: 'make dev', cwd: 'services/api' }),
    });

    expect(readRepoDevConfig(dir)).toBeNull();
  });

  it('accepts an absolute cwd inside the repository', () => {
    const repo = makeFixture('cfg-abs', {}, ['api']);
    writeConfig(repo, { command: 'make dev', cwd: join(repo, 'api') });

    expect(normalizePath(readRepoDevConfig(repo)?.cwd ?? '')).toBe(
      normalizePath(join(repo, 'api'))
    );
  });
});

describe('detectRepoConfig', () => {
  it('projects a valid config into a detector success', () => {
    const dir = makeFixture(
      'cfg-detect',
      {
        [CONFIG]: JSON.stringify({
          command: 'make dev',
          cwd: 'api',
          expectedPort: 8080,
          language: 'Go',
          setupCommands: ['go mod download'],
        }),
      },
      ['api']
    );

    expect(detectRepoConfig(dir)).toMatchObject({
      success: true,
      command: 'make dev',
      expectedPort: 8080,
      language: 'Go',
      setupCommands: ['go mod download'],
      needsInstall: false,
    });
  });

  it('falls through when the file is absent', () => {
    const dir = makeFixture('cfg-detect-none');

    expect(detectRepoConfig(dir).success).toBe(false);
  });

  it('falls through when the file is malformed', () => {
    const dir = makeFixture('cfg-detect-bad', { [CONFIG]: '{ broken' });

    expect(detectRepoConfig(dir).success).toBe(false);
  });
});
