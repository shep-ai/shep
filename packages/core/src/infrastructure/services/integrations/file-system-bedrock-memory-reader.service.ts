/**
 * FileSystemBedrockMemoryReader — concrete adapter for IBedrockMemoryReader.
 *
 * Walks `<cwd>/.bedrock/` recursively, returns a typed BedrockMemorySnapshot
 * for the BedrockMemoryPanel visualization. The walk is shallow on errors:
 * a missing or unreadable directory yields a `present: false` snapshot
 * rather than a thrown exception, so the UI can render a clean empty state
 * regardless of host filesystem quirks.
 *
 * Cross-platform notes (per packages/CLAUDE.md):
 *   - `path.join`/`path.relative` used throughout — no string concat.
 *   - Stored relative paths are normalized to forward slashes for cross-OS
 *     comparability and stable rendering on the web client.
 *   - File reads use `node:fs/promises` only; no subprocess spawning.
 */

import { promises as fs, type Dirent, type Stats } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { injectable } from 'tsyringe';

import type { BedrockMemoryFile, BedrockMemorySnapshot } from '../../../domain/generated/output.js';
import type {
  BedrockMemoryReaderOptions,
  IBedrockMemoryReader,
} from '../../../application/ports/output/services/bedrock-memory-reader.interface.js';

const BEDROCK_DIR = '.bedrock';
const DEFAULT_PREVIEW_BYTES = 256;

@injectable()
export class FileSystemBedrockMemoryReader implements IBedrockMemoryReader {
  async read(opts: BedrockMemoryReaderOptions): Promise<BedrockMemorySnapshot> {
    const root = join(opts.cwd, BEDROCK_DIR);
    const empty: BedrockMemorySnapshot = {
      cwd: opts.cwd,
      present: false,
      files: [],
      totalBytes: BigInt(0),
    };

    let present: boolean;
    try {
      const stat = await fs.stat(root);
      present = stat.isDirectory();
    } catch {
      return empty;
    }
    if (!present) return empty;

    const previewBytes = opts.previewBytes ?? DEFAULT_PREVIEW_BYTES;
    const files: BedrockMemoryFile[] = [];
    try {
      await walk(root, root, previewBytes, files);
    } catch {
      // Partial walk — fall through with whatever we collected.
    }

    files.sort((a, b) => a.path.localeCompare(b.path));

    const totalBytes = files.reduce<bigint>(
      (acc, f) => acc + BigInt(typeof f.sizeBytes === 'bigint' ? f.sizeBytes : Number(f.sizeBytes)),
      BigInt(0)
    );

    let mostRecent: Date | undefined;
    for (const f of files) {
      const modified = f.modifiedAt instanceof Date ? f.modifiedAt : new Date(f.modifiedAt);
      if (!mostRecent || modified.getTime() > mostRecent.getTime()) {
        mostRecent = modified;
      }
    }

    return {
      cwd: opts.cwd,
      present: true,
      files,
      totalBytes,
      ...(mostRecent ? { mostRecentlyModifiedAt: mostRecent } : {}),
    };
  }
}

async function walk(
  root: string,
  current: string,
  previewBytes: number,
  out: BedrockMemoryFile[]
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(current, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') && current !== root) continue;
    const abs = join(current, entry.name);
    if (entry.isDirectory()) {
      await walk(root, abs, previewBytes, out);
      continue;
    }
    if (!entry.isFile()) continue;

    let stat: Stats;
    try {
      stat = await fs.stat(abs);
    } catch {
      continue;
    }

    let preview: string | undefined;
    if (previewBytes > 0) {
      try {
        const buf = await fs.readFile(abs);
        preview = buf.subarray(0, previewBytes).toString('utf8');
      } catch {
        preview = undefined;
      }
    }

    const rel = relative(root, abs).split(sep).join('/');
    out.push({
      path: rel,
      sizeBytes: BigInt(stat.size),
      modifiedAt: stat.mtime,
      ...(preview !== undefined ? { preview } : {}),
    });
  }
}
