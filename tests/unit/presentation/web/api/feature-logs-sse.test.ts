// @vitest-environment node

/**
 * SSE API Route: GET /api/feature-logs (spec 116, task 12).
 *
 * - reads the worker log where core resolves it (GetWorkerLogPathUseCase,
 *   which honours SHEP_HOME) — never via a global accessor in presentation
 * - after the initial event, streams only the appended text
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RUN_ID = 'run-42';

/** Where core resolves the worker log; set per test from SHEP_HOME. */
let coreLogPath = '';
const resolvedTokens: string[] = [];

// The route must ask core for the log path (GetWorkerLogPathUseCase, by token)
// instead of calling the global getShepHomeDir() from presentation.
vi.mock('@/lib/server-container', () => ({
  resolve: vi.fn((token: string) => {
    resolvedTokens.push(token);
    if (token === 'GetWorkerLogPathUseCase') {
      return { execute: vi.fn((runId: string) => (runId === RUN_ID ? coreLogPath : '')) };
    }
    return {
      findById: vi.fn(async (id: string) => ({ id, name: 'Feature', agentRunId: RUN_ID })),
    };
  }),
}));

vi.mock('@shepai/core/infrastructure/services/filesystem/shep-directory.service', () => ({
  getShepHomeDir: () => {
    throw new Error('presentation must not call getShepHomeDir()');
  },
}));

/** Read SSE frames until `predicate` matches one; returns every frame seen. */
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (frame: string) => boolean
): Promise<string[]> {
  const decoder = new TextDecoder();
  const frames: string[] = [];
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return frames;
    buffer += decoder.decode(value, { stream: true });
    let end = buffer.indexOf('\n\n');
    while (end !== -1) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      frames.push(frame);
      if (predicate(frame)) return frames;
      end = buffer.indexOf('\n\n');
    }
  }
}

function dataOf(frame: string): { content: string } {
  const line = frame.split('\n').find((l) => l.startsWith('data: '));
  return JSON.parse(line!.slice('data: '.length));
}

describe('SSE API Route: GET /api/feature-logs', () => {
  let shepHome: string;
  let previousShepHome: string | undefined;
  let logPath: string;

  beforeEach(() => {
    previousShepHome = process.env.SHEP_HOME;
    shepHome = mkdtempSync(join(tmpdir(), 'shep-feature-logs-'));
    process.env.SHEP_HOME = shepHome;
    mkdirSync(join(shepHome, 'logs'));
    logPath = join(shepHome, 'logs', `worker-${RUN_ID}.log`);
    coreLogPath = logPath;
    resolvedTokens.length = 0;
  });

  afterEach(() => {
    if (previousShepHome === undefined) delete process.env.SHEP_HOME;
    else process.env.SHEP_HOME = previousShepHome;
    rmSync(shepHome, { recursive: true, force: true });
  });

  it('streams the SHEP_HOME log, then only the appended non-ASCII text', async () => {
    writeFileSync(logPath, 'démarrage ✅\n');
    const { GET } = await import(
      '../../../../../src/presentation/web/app/api/feature-logs/route.js'
    );
    const controller = new AbortController();
    const response = await GET(
      new Request('http://localhost:3000/api/feature-logs?featureId=feat-1', {
        signal: controller.signal,
      })
    );
    const reader = response.body!.getReader();

    try {
      const initial = await readUntil(reader, (f) => f.startsWith('event: initial'));
      expect(dataOf(initial.at(-1)!).content).toBe('démarrage ✅\n');
      expect(resolvedTokens).toContain('GetWorkerLogPathUseCase');

      appendFileSync(logPath, 'étape 2 🚀\n');
      const appended = await readUntil(reader, (f) => f.startsWith('event: log'));
      expect(dataOf(appended.at(-1)!).content).toBe('étape 2 🚀\n');
    } finally {
      controller.abort();
      reader.releaseLock();
    }
  }, 10_000);
});
