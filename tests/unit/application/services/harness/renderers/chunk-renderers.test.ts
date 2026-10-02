import { describe, it, expect } from 'vitest';
import { ChunkKind, ChunkVisibility as V } from '@/domain/generated/output.js';
import {
  renderChunkView,
  rendererFor,
} from '@/application/services/harness/renderers/chunk-renderers.js';

const FILE = [
  "import { verify } from './jwt';",
  '',
  'export interface Session { token: string }',
  '',
  'export function refresh(token: string): string {',
  '  // rotate the refresh token before expiry',
  '  return verify(token);',
  '}',
  ...Array.from({ length: 200 }, (_, i) => `const filler${i} = ${i};`),
  'export class TokenStore {}',
].join('\n');

const VITEST_LOG = [
  ' RUN  v4.1.11 /repo',
  ' ✓ src/a.test.ts (3 tests)',
  ' FAIL  src/auth/refresh.test.ts > refresh > rotates before expiry',
  'AssertionError: expected 1700000000 to be greater than 1700000060',
  ' ❯ src/auth/refresh.test.ts:14:21',
  ...Array.from({ length: 50 }, (_, i) => `    at frame${i} (node:internal)`),
  ' FAIL  src/auth/session.test.ts > session > keeps user',
  'Error: Cannot read properties of undefined',
  ' Test Files  2 failed | 1 passed (3)',
  '      Tests  2 failed | 3 passed (5)',
].join('\n');

const DIFF = [
  'diff --git a/src/auth/refresh.ts b/src/auth/refresh.ts',
  '--- a/src/auth/refresh.ts',
  '+++ b/src/auth/refresh.ts',
  '@@ -1,2 +1,2 @@',
  '-old refresh',
  '+new refresh',
  'diff --git a/README.md b/README.md',
  '--- a/README.md',
  '+++ b/README.md',
  '@@ -1 +1 @@',
  '-# a',
  '+# b',
].join('\n');

const chunk = (kind: ChunkKind) => ({ id: 'chunk-1', kind });

describe('chunk renderers', () => {
  it('hidden renders nothing; full renders raw (numbered for files)', () => {
    expect(renderChunkView(chunk(ChunkKind.CommandOutput), 'x\ny', V.Hidden, 'q').content).toBe('');
    expect(renderChunkView(chunk(ChunkKind.CommandOutput), 'x\ny', V.Full, 'q').content).toBe(
      'x\ny'
    );
    expect(renderChunkView(chunk(ChunkKind.File), 'a\nb', V.Full, 'q').content).toBe('1│a\n2│b');
  });

  it('file short view is the outline with line numbers', () => {
    const r = renderChunkView(chunk(ChunkKind.File), FILE, V.Short, 'refresh');
    expect(r.content).toContain('209 lines. Outline:');
    expect(r.content).toContain('    5│export function refresh(token: string): string {');
    expect(r.content).toContain('export class TokenStore');
    expect(r.content).not.toContain('filler10');
    expect(r.content).toMatch(
      /\[short view of chunk chunk-1 — call expand_chunk for more detail\]$/
    );
  });

  it('file long view adds query-relevant ranges', () => {
    const r = renderChunkView(chunk(ChunkKind.File), FILE, V.Long, 'rotate refresh token');
    expect(r.content).toContain('Relevant ranges:');
    expect(r.content).toContain('6│  // rotate the refresh token before expiry');
    expect(r.content.length).toBeLessThan(FILE.length);
  });

  it('test-result short view names every failing test and the first cause', () => {
    const r = renderChunkView(chunk(ChunkKind.TestResult), VITEST_LOG, V.Short, 'q');
    expect(r.content).toContain(
      'Summary: Test Files  2 failed | 1 passed (3) | Tests  2 failed | 3 passed (5)'
    );
    expect(r.content).toContain('FAIL  src/auth/refresh.test.ts > refresh > rotates before expiry');
    expect(r.content).toContain('FAIL  src/auth/session.test.ts > session > keeps user');
    expect(r.content).toContain(
      'AssertionError: expected 1700000000 to be greater than 1700000060'
    );
    expect(r.content).not.toContain('frame30');
  });

  it('test-result long view shows failure context, still smaller than raw', () => {
    const r = renderChunkView(chunk(ChunkKind.TestResult), VITEST_LOG, V.Long, 'q');
    expect(r.content).toContain('Failure details:');
    expect(r.content.length).toBeLessThan(VITEST_LOG.length + 200);
  });

  it('search short view summarizes files and caps hits', () => {
    const raw = Array.from(
      { length: 40 },
      (_, i) => `src/f${i % 3}.ts:${i + 1}:refreshToken()`
    ).join('\n');
    const r = renderChunkView(chunk(ChunkKind.SearchResult), raw, V.Short, 'q');
    expect(r.content.split('\n')[0]).toBe(
      '40 matches in 3 files: src/f0.ts (14), src/f1.ts (13), src/f2.ts (13)'
    );
    expect(r.content).toContain('… (25 more matches)');
  });

  it('diff short view lists files with +/- counts; long view prefers relevant files', () => {
    const short = renderChunkView(chunk(ChunkKind.Diff), DIFF, V.Short, 'q').content;
    expect(short).toContain('2 files changed:\n  src/auth/refresh.ts +1 -1\n  README.md +1 -1');
    const long = renderChunkView(chunk(ChunkKind.Diff), DIFF, V.Long, 'refresh').content;
    expect(long).toContain('+new refresh');
    expect(long).not.toContain('+# b');
  });

  it('command short view surfaces errors and the tail', () => {
    const raw = [
      'installing',
      'npm ERR! code E404',
      ...Array.from({ length: 30 }, (_, i) => `line ${i}`),
    ].join('\n');
    const r = renderChunkView(chunk(ChunkKind.CommandOutput), raw, V.Short, 'q').content;
    expect(r).toContain('Errors:\nnpm ERR! code E404');
    expect(r).toContain('line 29');
    expect(r).not.toContain('line 3\n');
  });

  it('every core kind has a renderer with a versioned id', () => {
    for (const kind of [
      ChunkKind.File,
      ChunkKind.SearchResult,
      ChunkKind.CommandOutput,
      ChunkKind.TestResult,
      ChunkKind.Diff,
      ChunkKind.Instruction,
      ChunkKind.PromptSection,
    ]) {
      expect(rendererFor(kind).id).toMatch(/@\d+$/);
    }
  });
});
