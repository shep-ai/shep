/**
 * Log Viewer Unit Tests
 *
 * Tests for the shared log viewing utility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { appendFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mockError = vi.fn();
const mockInfo = vi.fn();

vi.mock('../../../../../src/presentation/cli/ui/index.js', () => ({
  messages: {
    error: (...args: unknown[]) => mockError(...args),
    info: (...args: unknown[]) => mockInfo(...args),
  },
}));

import {
  createLogFollower,
  viewLog,
} from '../../../../../src/presentation/cli/commands/log-viewer.js';

describe('viewLog', () => {
  let tmpDir: string;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = mkdtempSync(join(tmpdir(), 'log-viewer-test-'));
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    process.exitCode = undefined as any;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    stdoutWriteSpy.mockRestore();
  });

  it('returns false and shows error when log file does not exist', async () => {
    const result = await viewLog({
      logPath: join(tmpDir, 'nonexistent.log'),
      lines: 0,
      label: 'test run',
    });

    expect(result).toBe(false);
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('No log file found'));
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Expected:'));
  });

  it('returns false and shows info when log file is empty (non-follow)', async () => {
    const logPath = join(tmpDir, 'empty.log');
    writeFileSync(logPath, '');

    const result = await viewLog({
      logPath,
      lines: 0,
      label: 'test run',
    });

    expect(result).toBe(false);
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('empty'));
  });

  it('prints full log content to stdout', async () => {
    const logPath = join(tmpDir, 'full.log');
    writeFileSync(logPath, 'line 1\nline 2\nline 3\n');

    const result = await viewLog({
      logPath,
      lines: 0,
      label: 'test run',
    });

    expect(result).toBe(true);
    const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(output).toContain('line 1');
    expect(output).toContain('line 2');
    expect(output).toContain('line 3');
  });

  it('prints only last N lines when lines > 0', async () => {
    const logPath = join(tmpDir, 'tail.log');
    writeFileSync(logPath, 'line 1\nline 2\nline 3\nline 4\nline 5\n');

    const result = await viewLog({
      logPath,
      lines: 2,
      label: 'test run',
    });

    expect(result).toBe(true);
    const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(output).toContain('line 5');
    expect(output).not.toContain('line 1');
    expect(output).not.toContain('line 2');
  });

  it('prints last N lines from a large file (> 64KB)', async () => {
    const logPath = join(tmpDir, 'large.log');
    // Generate a file > 64KB
    const lines: string[] = [];
    for (let i = 0; i < 2000; i++) {
      lines.push(`log entry ${i}: ${'x'.repeat(40)}`);
    }
    writeFileSync(logPath, `${lines.join('\n')}\n`);

    const result = await viewLog({
      logPath,
      lines: 3,
      label: 'test run',
    });

    expect(result).toBe(true);
    const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(output).toContain('log entry 1999');
    expect(output).not.toContain('log entry 0:');
  });
});

/**
 * Spec 116 — follow mode read raw chunks and decoded each one on its own, so
 * a multi-byte character split across two reads printed as U+FFFD twice.
 * The split must land inside a real Buffer, not a JS string (see LESSONS.md).
 */
describe('createLogFollower', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'log-follow-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('keeps a 4-byte emoji intact when a write splits it across two reads', async () => {
    const logPath = join(tmpDir, 'follow.log');
    writeFileSync(logPath, '');
    const text = 'héllo — 日本語 🚀 done\n';
    const payload = Buffer.from(text, 'utf8');
    const split = payload.indexOf(Buffer.from('🚀', 'utf8')) + 2;

    const handle = await open(logPath, 'r');
    const output: string[] = [];
    const readNew = createLogFollower(logPath, handle, 0, (chunk) => output.push(chunk));

    appendFileSync(logPath, payload.subarray(0, split));
    await readNew();
    appendFileSync(logPath, payload.subarray(split));
    await readNew();
    await handle.close();

    expect(output.join('')).toBe(text);
  });

  it('prints each appended byte once when two reads overlap', async () => {
    const logPath = join(tmpDir, 'overlap.log');
    writeFileSync(logPath, '');
    const handle = await open(logPath, 'r');
    const output: string[] = [];
    const readNew = createLogFollower(logPath, handle, 0, (chunk) => output.push(chunk));

    appendFileSync(logPath, 'one line\n');
    // fs.watch and the fallback poll can fire together.
    await Promise.all([readNew(), readNew()]);
    await handle.close();

    expect(output.join('')).toBe('one line\n');
  });
});

describe('viewLog tail of a large file', () => {
  let tmpDir: string;
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'log-tail-test-'));
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    stdoutWriteSpy.mockRestore();
  });

  it('does not corrupt a multi-byte character on a backwards read boundary', async () => {
    /** Mirrors the backwards read chunk in log-viewer.ts#readTailLines. */
    const TAIL_CHUNK_BYTES = 8192;
    const lastLine = `${'x'.repeat(10)}🚀${'y'.repeat(TAIL_CHUNK_BYTES - 2)}`;
    // Put the chunk boundary (size - 8192) two bytes into the emoji.
    const emojiStart = Buffer.byteLength(`${'x'.repeat(10)}`);
    const tailBytes = Buffer.byteLength(lastLine) - emojiStart - 2;
    expect(tailBytes).toBe(TAIL_CHUNK_BYTES);
    const logPath = join(tmpDir, 'big.log');
    writeFileSync(logPath, `${'filler line\n'.repeat(8000)}${lastLine}`);

    await viewLog({ logPath, lines: 1, label: 'test run' });

    const output = stdoutWriteSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(output).not.toContain('�');
    expect(output).toContain('🚀');
  });
});
