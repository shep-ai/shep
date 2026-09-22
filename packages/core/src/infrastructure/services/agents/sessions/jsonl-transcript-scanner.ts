/**
 * Incremental JSONL transcript scanning.
 *
 * Agent CLIs append to their transcript files while a session is live, and
 * the session list is re-read on a timer. Two properties follow:
 *
 * 1. The last line of a live transcript is often half-written. A reader that
 *    treats that line as corruption loses the very session that is most
 *    interesting to the user. Only newline-terminated lines are committed; a
 *    trailing remainder is applied to a throw-away copy if it parses, and is
 *    re-read on the next scan once it is complete.
 * 2. Re-parsing a multi-megabyte transcript on every poll is wasted work.
 *    Transcripts are append-only, so `TranscriptSummaryCache` remembers how
 *    far each file was scanned and reads only the bytes appended since.
 *
 * A malformed complete line is skipped rather than failing the whole file.
 */

import * as fs from 'node:fs/promises';

/** Bytes read per `read()` call; bounds memory for arbitrarily large files. */
export const TRANSCRIPT_READ_CHUNK_BYTES = 256 * 1024;

/** Transcripts whose scan progress is remembered; least recently used are evicted. */
export const MAX_CACHED_TRANSCRIPTS = 500;

const NEWLINE = 0x0a;

/** Folds transcript entries into a summary. `clone()` must be a deep copy. */
export interface TranscriptAccumulator<Self> {
  add(entry: unknown): void;
  clone(): Self;
}

export interface JsonlScanResult {
  /** Byte offset just past the last newline-terminated line that was read. */
  committedOffset: number;
  /** A parseable entry after the last newline (live file, or no final EOL). */
  trailingEntry?: unknown;
}

function parseLine(text: string): { ok: true; entry: unknown } | { ok: false } {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false };
  try {
    return { ok: true, entry: JSON.parse(trimmed) as unknown };
  } catch {
    return { ok: false };
  }
}

/**
 * Stream a JSONL file from `fromOffset`, calling `onEntry` for every complete
 * line that parses. Decoding happens per complete line, so a multi-byte
 * character split across two reads is never corrupted (a UTF-8 continuation
 * byte can never equal `\n`).
 */
export async function scanJsonl(
  filePath: string,
  fromOffset: number,
  onEntry: (entry: unknown) => void
): Promise<JsonlScanResult> {
  const handle = await fs.open(filePath, 'r');
  let committedOffset = fromOffset;
  let pending = Buffer.alloc(0);

  try {
    const chunk = Buffer.alloc(TRANSCRIPT_READ_CHUNK_BYTES);
    let position = fromOffset;
    for (;;) {
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, position);
      if (bytesRead === 0) break;
      position += bytesRead;
      pending = pending.length
        ? Buffer.concat([pending, chunk.subarray(0, bytesRead)])
        : Buffer.from(chunk.subarray(0, bytesRead));

      let lineStart = 0;
      let newline = pending.indexOf(NEWLINE, lineStart);
      while (newline !== -1) {
        const parsed = parseLine(pending.toString('utf-8', lineStart, newline));
        if (parsed.ok) onEntry(parsed.entry);
        committedOffset += newline + 1 - lineStart;
        lineStart = newline + 1;
        newline = pending.indexOf(NEWLINE, lineStart);
      }
      pending = pending.subarray(lineStart);
    }
  } finally {
    await handle.close();
  }

  const trailing = parseLine(pending.toString('utf-8'));
  return trailing.ok ? { committedOffset, trailingEntry: trailing.entry } : { committedOffset };
}

/** Scan a whole transcript into a fresh accumulator, trailing line included. */
export async function scanTranscript<A extends TranscriptAccumulator<A>>(
  filePath: string,
  accumulator: A
): Promise<A> {
  const result = await scanJsonl(filePath, 0, (entry) => accumulator.add(entry));
  if (result.trailingEntry !== undefined) accumulator.add(result.trailingEntry);
  return accumulator;
}

/**
 * Resolve a stored entry timestamp: `undefined` = no entry seen, `null` = an
 * entry without a timestamp, for which `fallback` (the file mtime) stands in.
 */
export function resolveTimestamp(
  value: string | null | undefined,
  fallback: Date
): Date | undefined {
  if (value === undefined) return undefined;
  return value === null ? fallback : new Date(value);
}

/** An entry timestamp as stored by accumulators (see {@link resolveTimestamp}). */
export function storedTimestamp(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

interface CacheEntry<A> {
  /** Inode + birth time: a replaced file at the same path must be rescanned. */
  identity: string;
  committedOffset: number;
  accumulator: A;
}

/**
 * Remembers per-file scan progress so a repeated list reads only new bytes.
 * Owned by a repository instance (the DI container keeps one per process).
 */
export class TranscriptSummaryCache<A extends TranscriptAccumulator<A>> {
  private readonly entries = new Map<string, CacheEntry<A>>();
  /** Scans of one file are serialised: two would fold the same bytes twice. */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    /** Fresh accumulator for a file (the path lets it derive e.g. a session id). */
    private readonly create: (filePath: string) => A,
    private readonly maxEntries: number = MAX_CACHED_TRANSCRIPTS
  ) {}

  /** Summary of `filePath` as of now. Throws if the file cannot be read. */
  summarize(filePath: string): Promise<A> {
    const previous = this.inFlight.get(filePath) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.scanFrom(filePath));
    this.inFlight.set(filePath, run);
    const release = () => {
      if (this.inFlight.get(filePath) === run) this.inFlight.delete(filePath);
    };
    run.then(release, release);
    return run;
  }

  private async scanFrom(filePath: string): Promise<A> {
    const stat = await fs.stat(filePath);
    const identity = `${stat.ino}:${stat.birthtimeMs}`;

    let cached = this.entries.get(filePath);
    if (cached?.identity !== identity || stat.size < cached.committedOffset) {
      cached = { identity, committedOffset: 0, accumulator: this.create(filePath) };
    }

    const target = cached.accumulator;
    let result: JsonlScanResult;
    try {
      result = await scanJsonl(filePath, cached.committedOffset, (entry) => target.add(entry));
    } catch (error) {
      // The accumulator may hold part of the failed read: never reuse it.
      this.entries.delete(filePath);
      throw error;
    }
    cached.committedOffset = result.committedOffset;
    this.remember(filePath, cached);

    const summary = target.clone();
    if (result.trailingEntry !== undefined) summary.add(result.trailingEntry);
    return summary;
  }

  private remember(filePath: string, entry: CacheEntry<A>): void {
    // Re-insert so Map order tracks recency; evict from the old end.
    this.entries.delete(filePath);
    this.entries.set(filePath, entry);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
