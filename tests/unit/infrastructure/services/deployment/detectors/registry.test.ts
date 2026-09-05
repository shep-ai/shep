// @vitest-environment node

/**
 * Detector registry Unit Tests
 *
 * Precedence is the single highest-risk item in this feature: every
 * repository shep runs today is resolved by the Node detector, so the
 * ordering here is a backward-compatibility contract, not a preference.
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  detectDevScript,
  detectRunPlan,
} from '@/infrastructure/services/deployment/detect-dev-script.js';
import {
  DETECTOR_REGISTRY,
  Ecosystem,
  MAX_SCANNED_SUBDIRS,
} from '@/infrastructure/services/deployment/detectors/registry.js';
import {
  cleanupFixtures,
  makeFixture,
  normalizePath,
} from '@tests/helpers/detector-fixture.helper.js';

/** Every manifest of the polyglot fixture, in precedence order. */
const POLYGLOT = {
  'package.json': JSON.stringify({ scripts: { dev: 'vite' } }),
  Makefile: 'dev:\n\tmake-dev\n',
  'pyproject.toml': '[tool.poetry]\nname = "x"\n\n[tool.poetry.scripts]\ndev = "x:dev"\n',
  'poetry.lock': '',
  'docker-compose.yml': 'services:\n  web:\n    image: nginx\n',
};

/** Build the polyglot fixture minus the given manifests. */
function polyglotWithout(...omit: string[]): string {
  const files = Object.fromEntries(
    Object.entries(POLYGLOT).filter(([name]) => !omit.includes(name))
  );
  return makeFixture('polyglot', files);
}

afterEach(() => cleanupFixtures());

describe('DETECTOR_REGISTRY — ordering contract', () => {
  it('is the documented order, Node first and Compose last', () => {
    expect(DETECTOR_REGISTRY.map((entry) => entry.ecosystem)).toEqual([
      Ecosystem.Node,
      Ecosystem.Deno,
      Ecosystem.Make,
      Ecosystem.Python,
      Ecosystem.Go,
      Ecosystem.Rust,
      Ecosystem.Ruby,
      Ecosystem.Elixir,
      Ecosystem.Compose,
    ]);
  });

  it('does not include the repo-config tier, which is read before the cache', () => {
    expect(DETECTOR_REGISTRY.map((entry) => entry.ecosystem)).not.toContain(Ecosystem.RepoConfig);
  });
});

describe('detectRunPlan — polyglot precedence', () => {
  it('resolves to Node deterministically across 10 consecutive runs', () => {
    const dir = polyglotWithout();

    for (let run = 0; run < 10; run++) {
      const outcome = detectRunPlan(dir);

      expect(outcome.ecosystem).toBe(Ecosystem.Node);
      expect(outcome.result).toMatchObject({ command: 'npm run dev' });
    }
  });

  it('promotes Make when package.json is removed', () => {
    const outcome = detectRunPlan(polyglotWithout('package.json'));

    expect(outcome.ecosystem).toBe(Ecosystem.Make);
    expect(outcome.result).toMatchObject({ command: 'make dev' });
  });

  it('promotes Python when package.json and the Makefile are removed', () => {
    const outcome = detectRunPlan(polyglotWithout('package.json', 'Makefile'));

    expect(outcome.ecosystem).toBe(Ecosystem.Python);
    expect(outcome.result).toMatchObject({ command: 'poetry run dev' });
  });

  it('promotes Compose when only the compose file remains', () => {
    const outcome = detectRunPlan(
      polyglotWithout('package.json', 'Makefile', 'pyproject.toml', 'poetry.lock')
    );

    expect(outcome.ecosystem).toBe(Ecosystem.Compose);
    expect(outcome.result).toMatchObject({ command: 'docker compose up' });
  });
});

describe('detectRunPlan — subdirectory fallback', () => {
  const nested: [string, Record<string, string>, string][] = [
    ['node', { 'package.json': JSON.stringify({ scripts: { dev: 'vite' } }) }, 'npm run dev'],
    ['deno', { 'deno.json': JSON.stringify({ tasks: { dev: 'x' } }) }, 'deno task dev'],
    ['make', { Makefile: 'dev:\n\tx\n' }, 'make dev'],
    ['python', { 'manage.py': '' }, 'python manage.py runserver'],
    ['rust', { 'Cargo.toml': '[package]\nname = "a"\n' }, 'cargo run'],
    ['ruby', { Gemfile: "gem 'rails'\n" }, 'bundle exec rails server'],
    ['elixir', { 'mix.exs': 'defmodule A do end\n' }, 'mix run --no-halt'],
    ['compose', { 'compose.yaml': 'services:\n  web:\n    image: nginx\n' }, 'docker compose up'],
  ];

  for (const [label, files, command] of nested) {
    it(`finds a ${label} project one level down`, () => {
      const scoped = Object.fromEntries(
        Object.entries(files).map(([name, contents]) => [`app/${name}`, contents])
      );
      const dir = makeFixture(`nested-${label}`, scoped);

      const outcome = detectRunPlan(dir);

      expect(outcome.result).toMatchObject({ command });
      expect(outcome.result.success && normalizePath(outcome.result.resolvedDir)).toBe(
        normalizePath(join(dir, 'app'))
      );
    });
  }

  it('finds a Go project one level down', () => {
    const dir = makeFixture('nested-go', {
      'app/go.mod': 'module a\n\ngo 1.22\n',
      'app/main.go': 'package main\n',
    });

    expect(detectRunPlan(dir).result).toMatchObject({ command: 'go run .' });
  });

  it('skips node_modules and dot-directories', () => {
    const dir = makeFixture('nested-skip', {
      'node_modules/pkg/package.json': JSON.stringify({ scripts: { dev: 'nope' } }),
      '.cache/package.json': JSON.stringify({ scripts: { dev: 'nope' } }),
      'dist/Makefile': 'dev:\n\tnope\n',
    });

    expect(detectRunPlan(dir).result.success).toBe(false);
  });

  it('does not recurse beyond one level', () => {
    const dir = makeFixture('nested-deep', {
      'a/b/package.json': JSON.stringify({ scripts: { dev: 'vite' } }),
    });

    expect(detectRunPlan(dir).result.success).toBe(false);
  });
});

describe('detectRunPlan — bounded work', () => {
  it('scans at most MAX_SCANNED_SUBDIRS subdirectories', () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < MAX_SCANNED_SUBDIRS + 5; i++) {
      // Zero-padded so the project sits past the cap in lexical order.
      files[`dir${String(i).padStart(3, '0')}/README.md`] = '';
    }
    files[`dir${String(MAX_SCANNED_SUBDIRS + 4).padStart(3, '0')}/package.json`] = JSON.stringify({
      scripts: { dev: 'vite' },
    });

    const dir = makeFixture('nested-wide', files);

    expect(detectRunPlan(dir).result.success).toBe(false);
  });

  it('completes in under 200 ms on a wide fixture', () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < MAX_SCANNED_SUBDIRS; i++) {
      files[`dir${String(i).padStart(3, '0')}/README.md`] = 'x';
    }
    const dir = makeFixture('perf-wide', files);

    const started = process.hrtime.bigint();
    detectRunPlan(dir);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

    expect(elapsedMs).toBeLessThan(200);
  });
});

describe('detectRunPlan — total fall-through', () => {
  it('reports the Node detector error verbatim', () => {
    const dir = makeFixture('fallthrough');

    const outcome = detectRunPlan(dir);

    expect(outcome.ecosystem).toBe(Ecosystem.Node);
    expect(outcome.result).toEqual({
      success: false,
      error: `No package.json found in ${dir}`,
    });
  });

  it('reports the missing-script error when package.json exists without one', () => {
    const dir = makeFixture('fallthrough-scripts', {
      'package.json': JSON.stringify({ scripts: { build: 'tsc' } }),
    });

    expect(detectRunPlan(dir).result).toEqual({
      success: false,
      error: 'No dev script found in package.json. Expected one of: dev, start, serve',
    });
  });
});

describe('detectDevScript — legacy projection', () => {
  it('returns the winning detector result verbatim, with no provenance field', () => {
    const dir = makeFixture('legacy', {
      'package.json': JSON.stringify({ scripts: { dev: 'x' } }),
    });

    expect(detectDevScript(dir)).toEqual({
      success: true,
      packageManager: 'npm',
      scriptName: 'dev',
      command: 'npm run dev',
      needsInstall: true,
      resolvedDir: dir,
    });
  });

  it('returns a non-Node result without packageManager or scriptName', () => {
    const dir = makeFixture('legacy-make', { Makefile: 'dev:\n\tx\n' });

    const result = detectDevScript(dir);

    expect(result).toMatchObject({ success: true, command: 'make dev' });
    expect(result.success && result.packageManager).toBeUndefined();
  });
});

describe('existsSync gating — proven end-to-end', () => {
  it('never lets a non-Node detector read package.json bytes as its own manifest', () => {
    // A directory holding ONLY package.json, whose contents happen to look
    // like a Makefile, a compose file and a pyproject all at once. Every
    // non-Node detector must decline to read it because its own manifest is
    // absent — the gate, not the parse, is what protects them.
    const dir = makeFixture('gate', {
      'package.json': 'dev:\n\tx\nservices:\n  web:\n[tool.poetry.scripts]\ndev = "x"\n',
    });

    const outcome = detectRunPlan(dir);

    // package.json is not valid JSON here, so even Node falls through.
    expect(outcome.ecosystem).toBe(Ecosystem.Node);
    expect(outcome.result.success).toBe(false);
  });

  it('degrades to a fall-through when the directory cannot be listed', () => {
    const dir = makeFixture('gone');
    rmSync(dir, { recursive: true, force: true });

    expect(() => detectRunPlan(dir)).not.toThrow();
    expect(detectRunPlan(dir).result.success).toBe(false);
  });

  it('degrades to a fall-through when a manifest is a directory, not a file', () => {
    const dir = makeFixture('manifest-is-dir');
    mkdirSync(join(dir, 'Makefile'), { recursive: true });
    writeFileSync(join(dir, 'README.md'), 'x', 'utf-8');

    expect(() => detectRunPlan(dir)).not.toThrow();
    expect(detectRunPlan(dir).result.success).toBe(false);
  });
});
