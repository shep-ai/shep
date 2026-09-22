// @vitest-environment node

/**
 * createLogFileTail — incremental reader behind GET /api/feature-logs
 * (spec 116, task 12).
 *
 * The route used to compare the file's BYTE size to the decoded string's
 * UTF-16 length, so any log containing a non-ASCII character looked like it
 * had always grown and was re-read whole on every 2s tick, forever.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendFileSync, mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createLogFileTail } from '../../../../../src/presentation/web/lib/log-file-tail.js';

/**
 * Wrap node:fs/promises so the test can see how much of the file is read:
 * `reads` counts every read call and `bytes` the bytes they returned.
 */
function countingFs() {
  const counts = { reads: 0, bytes: 0 };
  return {
    counts,
    fs: {
      stat: fsp.stat,
      readFile: (async (...args: Parameters<typeof fsp.readFile>) => {
        const content = await fsp.readFile(...args);
        counts.reads++;
        counts.bytes += Buffer.byteLength(content);
        return content;
      }) as typeof fsp.readFile,
      open: async (...args: Parameters<typeof fsp.open>) => {
        const handle = await fsp.open(...args);
        const read = handle.read.bind(handle) as (...a: unknown[]) => Promise<{
          bytesRead: number;
        }>;
        (handle as unknown as { read: unknown }).read = async (...readArgs: unknown[]) => {
          const result = await read(...readArgs);
          counts.reads++;
          counts.bytes += result.bytesRead;
          return result;
        };
        return handle;
      },
    },
  };
}

describe('createLogFileTail', () => {
  let dir: string;
  let logPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'shep-log-tail-'));
    logPath = join(dir, 'worker-run.log');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null while the file does not exist', async () => {
    const tail = createLogFileTail(logPath);
    expect(await tail.readAppended()).toBeNull();
  });

  it('non-ASCII log: a tick with no growth neither reads the file nor yields content', async () => {
    writeFileSync(logPath, 'héllo — ✅ 日本語 🚀\n');
    const { fs, counts } = countingFs();
    const tail = createLogFileTail(logPath, fs);

    expect(await tail.readAppended()).toBe('héllo — ✅ 日本語 🚀\n');
    const readsAfterInitial = counts.reads;

    expect(await tail.readAppended()).toBeNull();
    expect(await tail.readAppended()).toBeNull();
    expect(counts.reads).toBe(readsAfterInitial);
  });

  it('append yields only the new bytes', async () => {
    writeFileSync(logPath, 'première ligne\n');
    const { fs, counts } = countingFs();
    const tail = createLogFileTail(logPath, fs);
    await tail.readAppended();

    const bytesBefore = counts.bytes;
    appendFileSync(logPath, 'deuxième ✅\n');
    expect(await tail.readAppended()).toBe('deuxième ✅\n');
    expect(counts.bytes - bytesBefore).toBe(Buffer.byteLength('deuxième ✅\n'));

    appendFileSync(logPath, 'third\n');
    expect(await tail.readAppended()).toBe('third\n');
  });

  it('keeps a multi-byte character intact when it is split across two appends', async () => {
    const payload = Buffer.from('before 🚀 after\n', 'utf8');
    const split = payload.indexOf(Buffer.from('🚀', 'utf8')) + 2;
    writeFileSync(logPath, payload.subarray(0, split));
    const tail = createLogFileTail(logPath);

    const first = await tail.readAppended();
    appendFileSync(logPath, payload.subarray(split));
    const second = await tail.readAppended();

    expect(`${first ?? ''}${second ?? ''}`).toBe('before 🚀 after\n');
    expect(first ?? '').not.toContain('�');
    expect(second ?? '').not.toContain('�');
  });

  it('does not deliver the same bytes twice when two ticks overlap', async () => {
    writeFileSync(logPath, 'line ✅\n');
    const tail = createLogFileTail(logPath);

    const results = await Promise.all([tail.readAppended(), tail.readAppended()]);

    expect(results.filter((r) => r !== null)).toEqual(['line ✅\n']);
  });

  it('restarts from the beginning when the file is truncated', async () => {
    writeFileSync(logPath, 'a long first generation of the log\n');
    const tail = createLogFileTail(logPath);
    await tail.readAppended();

    truncateSync(logPath, 0);
    appendFileSync(logPath, 'new\n');

    expect(await tail.readAppended()).toBe('new\n');
  });
});
