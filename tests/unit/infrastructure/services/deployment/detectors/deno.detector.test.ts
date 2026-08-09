// @vitest-environment node

/**
 * Deno detector Unit Tests
 *
 * TDD Phase: RED → GREEN
 */

import { describe, it, expect, afterEach } from 'vitest';
import { detectDeno } from '@/infrastructure/services/deployment/detectors/deno.detector.js';
import { cleanupFixtures, makeFixture } from '@tests/helpers/detector-fixture.helper.js';

const denoJson = (tasks: Record<string, string>) => JSON.stringify({ tasks });

afterEach(() => cleanupFixtures());

describe('detectDeno', () => {
  it('resolves "deno task dev" for a declared dev task', () => {
    const dir = makeFixture('deno-dev', { 'deno.json': denoJson({ dev: 'deno run -A main.ts' }) });

    expect(detectDeno(dir)).toMatchObject({
      success: true,
      command: 'deno task dev',
      scriptName: 'dev',
      packageManager: 'deno',
      language: 'TypeScript',
      runtime: 'deno',
      resolvedDir: dir,
    });
  });

  it('honours the dev → start → serve priority', () => {
    const dir = makeFixture('deno-priority', {
      'deno.json': denoJson({ serve: 'x', start: 'y', dev: 'z' }),
    });

    expect(detectDeno(dir)).toMatchObject({ command: 'deno task dev' });
  });

  it('falls back to start when dev is absent', () => {
    const dir = makeFixture('deno-start', { 'deno.json': denoJson({ build: 'x', start: 'y' }) });

    expect(detectDeno(dir)).toMatchObject({ command: 'deno task start' });
  });

  it('falls back to serve when dev and start are absent', () => {
    const dir = makeFixture('deno-serve', { 'deno.json': denoJson({ serve: 'y' }) });

    expect(detectDeno(dir)).toMatchObject({ command: 'deno task serve' });
  });

  it('reads a deno.jsonc with comments and trailing commas', () => {
    const dir = makeFixture('deno-jsonc', {
      'deno.jsonc': '{\n  // the dev task\n  "tasks": { "dev": "deno run -A main.ts", },\n}\n',
    });

    expect(detectDeno(dir)).toMatchObject({ command: 'deno task dev' });
  });
});

describe('detectDeno — expectedPort', () => {
  it('takes an explicit --port from the task definition', () => {
    const dir = makeFixture('deno-port', {
      'deno.json': denoJson({ dev: 'deno run -A main.ts --port 8321' }),
    });

    expect(detectDeno(dir)).toMatchObject({ expectedPort: 8321 });
  });

  it('leaves expectedPort unset when the task declares no port', () => {
    const dir = makeFixture('deno-noport', {
      'deno.json': denoJson({ dev: 'deno run -A main.ts' }),
    });

    const result = detectDeno(dir);

    expect(result.success && result.expectedPort).toBeUndefined();
  });
});

describe('detectDeno — fall-through', () => {
  it('falls through when no deno manifest exists', () => {
    const dir = makeFixture('deno-none');

    expect(detectDeno(dir).success).toBe(false);
  });

  it('falls through when the manifest declares no tasks', () => {
    const dir = makeFixture('deno-notasks', { 'deno.json': JSON.stringify({ imports: {} }) });

    expect(detectDeno(dir).success).toBe(false);
  });

  it('falls through when the manifest declares no matching task', () => {
    const dir = makeFixture('deno-nomatch', { 'deno.json': denoJson({ build: 'x', test: 'y' }) });

    expect(detectDeno(dir).success).toBe(false);
  });

  it('falls through on unparseable JSON without throwing', () => {
    const dir = makeFixture('deno-broken', { 'deno.json': '{ "tasks": ' });

    expect(() => detectDeno(dir)).not.toThrow();
    expect(detectDeno(dir).success).toBe(false);
  });

  it('falls through on an empty file', () => {
    const dir = makeFixture('deno-empty', { 'deno.json': '' });

    expect(detectDeno(dir).success).toBe(false);
  });

  it('never reads another ecosystem manifest when deno.json is absent', () => {
    const dir = makeFixture('deno-gate', {
      'package.json': JSON.stringify({ tasks: { dev: 'vite' } }),
    });

    expect(detectDeno(dir).success).toBe(false);
  });
});
