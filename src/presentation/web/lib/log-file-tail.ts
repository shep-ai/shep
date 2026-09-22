/**
 * Incremental reader for an append-only log file (server-only).
 *
 * Backs `GET /api/feature-logs`. Each `readAppended()` returns only the bytes
 * written since the previous call, so a quiet log costs one `stat` per tick.
 *
 * - Tracks a BYTE offset and reads `[offset, size)` with positioned reads —
 *   never the whole file, and never comparing bytes to a decoded string's
 *   UTF-16 length (which re-read every non-ASCII log in full, forever).
 * - Decodes through one `StringDecoder`, so a multi-byte character split
 *   across two appends is held back until its remaining bytes arrive instead
 *   of decoding to U+FFFD on both sides.
 * - Returns `null` for a call that overlaps one still in flight (fs.watch and
 *   the fallback poll both tick); the in-flight read delivers those bytes.
 * - Restarts from byte 0 when the file shrinks (truncated or replaced).
 */

import * as fsp from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';

type TailFs = Pick<typeof fsp, 'stat' | 'open'>;

/** Read size per positioned read — bounds memory for a large first read. */
const READ_CHUNK_BYTES = 64 * 1024;

export interface LogFileTail {
  /** Text appended since the last call, or `null` when there is none (or no file yet). */
  readAppended(): Promise<string | null>;
}

export function createLogFileTail(logPath: string, fs: TailFs = fsp): LogFileTail {
  let offset = 0;
  let decoder = new StringDecoder('utf8');
  let inFlight = false;

  async function readFrom(size: number): Promise<string> {
    const handle = await fs.open(logPath, 'r');
    try {
      const buffer = Buffer.alloc(Math.min(READ_CHUNK_BYTES, size - offset));
      let text = '';
      while (offset < size) {
        const length = Math.min(buffer.length, size - offset);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        if (bytesRead === 0) break;
        text += decoder.write(buffer.subarray(0, bytesRead));
        offset += bytesRead;
      }
      return text;
    } finally {
      await handle.close();
    }
  }

  return {
    async readAppended() {
      if (inFlight) return null;
      inFlight = true;
      try {
        const { size } = await fs.stat(logPath);
        if (size < offset) {
          offset = 0;
          decoder = new StringDecoder('utf8');
        }
        if (size === offset) return null;
        return (await readFrom(size)) || null;
      } catch {
        // File does not exist yet (the agent may just be starting) or vanished.
        return null;
      } finally {
        inFlight = false;
      }
    },
  };
}
