import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  scanJsonl,
  TranscriptSummaryCache,
  TRANSCRIPT_READ_CHUNK_BYTES,
  type TranscriptAccumulator,
} from '@/infrastructure/services/agents/sessions/jsonl-transcript-scanner.js';

class Collect implements TranscriptAccumulator<Collect> {
  readonly entries: unknown[] = [];
  add(entry: unknown): void {
    this.entries.push(entry);
  }
  clone(): Collect {
    const copy = new Collect();
    copy.entries.push(...this.entries);
    return copy;
  }
}

const jsonl = (...rows: unknown[]) => rows.map((r) => `${JSON.stringify(r)}\n`).join('');

describe('jsonl-transcript-scanner', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shep-jsonl-scan-'));
    file = path.join(dir, 't.jsonl');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('decodes a multi-byte character that straddles a read chunk boundary', async () => {
    const EMOJI = '🚀';
    // Pad so the 4-byte emoji starts two bytes before the first chunk ends.
    const prefix = '{"t":"';
    const padding = 'x'.repeat(TRANSCRIPT_READ_CHUNK_BYTES - prefix.length - 2);
    const text = `${padding}${EMOJI} done`;
    await fs.writeFile(file, `${prefix}${text}"}\n`);

    const seen: unknown[] = [];
    await scanJsonl(file, 0, (entry) => seen.push(entry));

    expect(seen).toEqual([{ t: text }]);
  });

  it('commits only newline-terminated lines and reports a parseable remainder', async () => {
    const body = jsonl({ n: 1 }, { n: 2 });
    await fs.writeFile(file, `${body}{"n":3}`);

    const seen: unknown[] = [];
    const result = await scanJsonl(file, 0, (entry) => seen.push(entry));

    expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
    expect(result.committedOffset).toBe(Buffer.byteLength(body));
    expect(result.trailingEntry).toEqual({ n: 3 });
  });

  it('does not fold the same bytes twice when two scans of a file overlap', async () => {
    await fs.writeFile(file, jsonl({ n: 1 }));
    const cache = new TranscriptSummaryCache(() => new Collect());
    await cache.summarize(file);
    await fs.appendFile(file, jsonl({ n: 2 }));

    // Both calls start from the same cached offset; unserialised, each would
    // fold `{ n: 2 }` into the shared state.
    const [a, b] = await Promise.all([cache.summarize(file), cache.summarize(file)]);

    expect(a.entries).toEqual([{ n: 1 }, { n: 2 }]);
    expect(b.entries).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('keeps summaries correct after the oldest cached file is evicted', async () => {
    const other = path.join(dir, 'other.jsonl');
    await fs.writeFile(file, jsonl({ n: 1 }));
    await fs.writeFile(other, jsonl({ n: 9 }));
    const cache = new TranscriptSummaryCache(() => new Collect(), 1);

    await cache.summarize(file);
    await cache.summarize(other); // evicts `file`
    await fs.appendFile(file, jsonl({ n: 2 }));

    expect((await cache.summarize(file)).entries).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('does not keep a trailing remainder in the cached state', async () => {
    await fs.writeFile(file, `${jsonl({ n: 1 })}{"n":2}`);
    const cache = new TranscriptSummaryCache(() => new Collect());

    expect((await cache.summarize(file)).entries).toEqual([{ n: 1 }, { n: 2 }]);
    // The writer finishes the line: it must be counted once, not twice.
    await fs.appendFile(file, '\n');
    expect((await cache.summarize(file)).entries).toEqual([{ n: 1 }, { n: 2 }]);
  });
});
