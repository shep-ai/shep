/**
 * Shared Log Viewer
 *
 * Displays a log file with support for follow mode and tail lines.
 * Used by both `shep agent logs` and `shep feat logs`.
 */

import {
  closeSync,
  createReadStream,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  watch,
} from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import { messages } from '../ui/index.js';
import { getCliI18n } from '../i18n.js';

export interface LogViewerOptions {
  /** Absolute path to the log file */
  logPath: string;
  /** Follow log output (like tail -f) */
  follow?: boolean;
  /** Number of lines to show from the end (0 = all) */
  lines: number;
  /** Label for error messages (e.g. "run abc123", "feature my-feat") */
  label: string;
}

/** Files smaller than this are read whole for a tail. */
const SMALL_FILE_BYTES = 64 * 1024;
/** Bytes read per backwards step when tailing a large file. */
const TAIL_CHUNK_BYTES = 8192;
/** Bytes read per step when following appended output. */
const FOLLOW_CHUNK_BYTES = 4096;
/** Fallback poll in case fs.watch misses events (NFS, etc.). */
const FOLLOW_POLL_INTERVAL_MS = 2000;
const NEWLINE_BYTE = 0x0a;

/**
 * Read the last N lines from a file without loading it all into memory.
 *
 * Chunks are collected as raw bytes and decoded once: a chunk boundary can
 * fall inside a multi-byte character, and decoding each chunk on its own
 * turns both halves into U+FFFD.
 */
function readTailLines(filePath: string, n: number): string {
  const stat = statSync(filePath);
  if (stat.size < SMALL_FILE_BYTES) {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    return lines.slice(Math.max(0, lines.length - n)).join('\n');
  }
  const fd = openSync(filePath, 'r');
  const chunks: Buffer[] = [];
  let found = 0;
  let pos = stat.size;
  try {
    while (pos > 0 && found <= n) {
      const readSize = Math.min(TAIL_CHUNK_BYTES, pos);
      pos -= readSize;
      const chunk = Buffer.alloc(readSize);
      readSync(fd, chunk, 0, readSize, pos);
      chunks.unshift(chunk);
      for (const byte of chunk) {
        if (byte === NEWLINE_BYTE) found++;
      }
    }
  } finally {
    closeSync(fd);
  }
  const lines = Buffer.concat(chunks).toString('utf-8').split('\n');
  return lines.slice(Math.max(0, lines.length - n)).join('\n');
}

/**
 * Returns a function that writes whatever was appended to `logPath` since the
 * previous call, starting at `startPosition`.
 *
 * One StringDecoder spans the whole follow session, so a character split
 * across two reads is held back until its remaining bytes arrive. Calls are
 * serialised: fs.watch and the fallback poll can fire together, and two
 * reads from the same position would print the same bytes twice.
 */
export function createLogFollower(
  logPath: string,
  handle: FileHandle,
  startPosition: number,
  write: (text: string) => void
): () => Promise<void> {
  let position = startPosition;
  const readBuf = Buffer.alloc(FOLLOW_CHUNK_BYTES);
  const decoder = new StringDecoder('utf8');
  let pending: Promise<void> = Promise.resolve();

  const readAppended = async (): Promise<void> => {
    try {
      const currentStat = statSync(logPath);
      while (position < currentStat.size) {
        const bytesToRead = Math.min(readBuf.length, currentStat.size - position);
        const { bytesRead } = await handle.read(readBuf, 0, bytesToRead, position);
        if (bytesRead === 0) break;
        const text = decoder.write(readBuf.subarray(0, bytesRead));
        if (text) write(text);
        position += bytesRead;
      }
    } catch {
      // File may have been deleted/rotated
    }
  };

  return () => {
    pending = pending.then(readAppended);
    return pending;
  };
}

/**
 * Display a log file to stdout with optional follow mode and tail lines.
 *
 * @returns false if the log file doesn't exist or is empty (in non-follow mode)
 */
export async function viewLog(opts: LogViewerOptions): Promise<boolean> {
  const { logPath, follow, lines: requestedLines, label } = opts;

  if (!existsSync(logPath)) {
    const t = getCliI18n().t;
    messages.error(t('cli:ui.logViewer.noLogFile', { label }));
    messages.info(t('cli:ui.logViewer.expectedAt', { path: logPath }));
    return false;
  }

  const stat = statSync(logPath);
  if (stat.size === 0) {
    const t = getCliI18n().t;
    messages.info(t('cli:ui.logViewer.logEmpty', { label }));
    if (!follow) return false;
    // In follow mode, continue — the file will grow
  }

  if (follow) {
    // Print existing content first
    if (stat.size > 0) {
      if (requestedLines > 0) {
        process.stdout.write(readTailLines(logPath, requestedLines));
        if (!process.stdout.destroyed) process.stdout.write('\n');
      } else {
        await new Promise<void>((resolve, reject) => {
          const stream = createReadStream(logPath, { encoding: 'utf-8' });
          stream.pipe(process.stdout, { end: false });
          stream.on('end', resolve);
          stream.on('error', reject);
        });
      }
    }

    // Follow new content using fs.watch (event-driven, no polling)
    const handle = await open(logPath, 'r');
    const readNewContent = createLogFollower(logPath, handle, stat.size, (text) =>
      process.stdout.write(text)
    );

    const watcher = watch(logPath, { persistent: true }, () => {
      readNewContent();
    });

    const fallbackInterval = setInterval(readNewContent, FOLLOW_POLL_INTERVAL_MS);

    const cleanup = async () => {
      watcher.close();
      clearInterval(fallbackInterval);
      await handle.close();
    };

    process.on('SIGINT', async () => {
      await cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await cleanup();
      process.exit(0);
    });
  } else {
    // Print mode
    if (requestedLines > 0) {
      process.stdout.write(readTailLines(logPath, requestedLines));
      process.stdout.write('\n');
    } else {
      await new Promise<void>((resolve, reject) => {
        const stream = createReadStream(logPath, { encoding: 'utf-8' });
        stream.pipe(process.stdout, { end: false });
        stream.on('end', () => {
          process.stdout.write('\n');
          resolve();
        });
        stream.on('error', reject);
      });
    }
  }

  return true;
}
