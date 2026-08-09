// @vitest-environment node

/**
 * Node detector Unit Tests
 *
 * The pinned `detect-dev-script.test.ts` suite already covers this logic
 * through the composition layer with mocked `node:fs`. These tests cover the
 * same contract against REAL fixtures, so the extraction is proven to behave
 * identically when actual bytes are on disk (NFR-9).
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { detectNode } from '@/infrastructure/services/deployment/detectors/node.detector.js';
import {
  cleanupFixtures,
  makeFixture,
  normalizePath,
} from '@tests/helpers/detector-fixture.helper.js';

const pkg = (scripts: Record<string, string>) => JSON.stringify({ name: 'fixture', scripts });

afterEach(() => cleanupFixtures());

describe('detectNode — script priority', () => {
  it('picks dev over start and serve', () => {
    const dir = makeFixture('node-priority', {
      'package.json': pkg({ serve: 'serve', start: 'node index.js', dev: 'vite' }),
    });

    const result = detectNode(dir);

    expect(result.success && result.scriptName).toBe('dev');
    expect(result.success && result.command).toBe('npm run dev');
  });

  it('falls back to start when dev is absent', () => {
    const dir = makeFixture('node-start', {
      'package.json': pkg({ build: 'tsc', start: 'node server.js' }),
    });

    expect(detectNode(dir)).toMatchObject({ success: true, scriptName: 'start' });
  });

  it('falls back to serve when dev and start are absent', () => {
    const dir = makeFixture('node-serve', {
      'package.json': pkg({ build: 'tsc', serve: 'serve -s build' }),
    });

    expect(detectNode(dir)).toMatchObject({ success: true, scriptName: 'serve' });
  });
});

describe('detectNode — package manager from lockfiles', () => {
  const cases = [
    { lockfile: 'bun.lock', manager: 'bun', command: 'bun run dev' },
    { lockfile: 'bun.lockb', manager: 'bun', command: 'bun run dev' },
    { lockfile: 'pnpm-lock.yaml', manager: 'pnpm', command: 'pnpm dev' },
    { lockfile: 'yarn.lock', manager: 'yarn', command: 'yarn dev' },
    { lockfile: 'package-lock.json', manager: 'npm', command: 'npm run dev' },
  ];

  for (const { lockfile, manager, command } of cases) {
    it(`detects ${manager} from ${lockfile} and builds "${command}"`, () => {
      const dir = makeFixture('node-lock', {
        'package.json': pkg({ dev: 'vite' }),
        [lockfile]: '',
      });

      const result = detectNode(dir);

      expect(result.success && result.packageManager).toBe(manager);
      expect(result.success && result.command).toBe(command);
    });
  }

  it('defaults to npm when no lockfile exists', () => {
    const dir = makeFixture('node-nolock', { 'package.json': pkg({ dev: 'vite' }) });

    expect(detectNode(dir)).toMatchObject({ packageManager: 'npm', command: 'npm run dev' });
  });

  it('prioritises bun over every other manager when lockfiles collide', () => {
    const dir = makeFixture('node-collide', {
      'package.json': pkg({ dev: 'vite' }),
      'bun.lock': '',
      'pnpm-lock.yaml': '',
      'yarn.lock': '',
      'package-lock.json': '',
    });

    expect(detectNode(dir)).toMatchObject({ packageManager: 'bun' });
  });

  it('prioritises pnpm over yarn when bun is absent', () => {
    const dir = makeFixture('node-pnpm-yarn', {
      'package.json': pkg({ dev: 'vite' }),
      'pnpm-lock.yaml': '',
      'yarn.lock': '',
    });

    expect(detectNode(dir)).toMatchObject({ packageManager: 'pnpm' });
  });
});

describe('detectNode — needsInstall and resolvedDir', () => {
  it('is true when node_modules is missing', () => {
    const dir = makeFixture('node-needs-install', { 'package.json': pkg({ dev: 'vite' }) });

    expect(detectNode(dir)).toMatchObject({ needsInstall: true });
  });

  it('is false when node_modules exists', () => {
    const dir = makeFixture('node-installed', { 'package.json': pkg({ dev: 'vite' }) }, [
      'node_modules',
    ]);

    expect(detectNode(dir)).toMatchObject({ needsInstall: false });
  });

  it('resolves to the directory it was given', () => {
    const dir = makeFixture('node-resolved', { 'package.json': pkg({ dev: 'vite' }) });

    const result = detectNode(dir);

    expect(result.success && normalizePath(result.resolvedDir)).toBe(normalizePath(dir));
  });
});

describe('detectNode — fall-through', () => {
  it('reports the missing package.json path when there is none', () => {
    const dir = makeFixture('node-missing');

    expect(detectNode(dir)).toEqual({
      success: false,
      error: `No package.json found in ${dir}`,
    });
  });

  it('does not log an error when there is simply no package.json', () => {
    // A missing package.json is the EXPECTED fall-through for the eight
    // non-Node ecosystems, so it must not surface as an error with a stack
    // trace on the deployment log stream (NFR-11).
    const dir = makeFixture('node-missing-quiet');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    detectNode(dir);

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reports the missing package.json path when the file is unparseable', () => {
    const dir = makeFixture('node-broken', { 'package.json': '{ not json' });

    expect(detectNode(dir)).toEqual({
      success: false,
      error: `No package.json found in ${dir}`,
    });
  });

  it('reports the script list when no matching script exists', () => {
    const dir = makeFixture('node-noscript', {
      'package.json': pkg({ build: 'tsc', test: 'vitest' }),
    });

    expect(detectNode(dir)).toEqual({
      success: false,
      error: 'No dev script found in package.json. Expected one of: dev, start, serve',
    });
  });

  it('reports the script list when package.json has no scripts field', () => {
    const dir = makeFixture('node-noscripts-field', {
      'package.json': JSON.stringify({ name: 'my-project' }),
    });

    expect(detectNode(dir)).toEqual({
      success: false,
      error: 'No dev script found in package.json. Expected one of: dev, start, serve',
    });
  });
});

describe('detectNode — result shape', () => {
  it('populates exactly the six historical fields (no ecosystem field)', () => {
    const dir = makeFixture('node-shape', { 'package.json': pkg({ dev: 'vite' }) });

    expect(detectNode(dir)).toEqual({
      success: true,
      packageManager: 'npm',
      scriptName: 'dev',
      command: 'npm run dev',
      needsInstall: true,
      resolvedDir: dir,
    });
  });
});
