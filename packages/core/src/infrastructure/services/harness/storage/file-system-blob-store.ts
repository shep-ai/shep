/**
 * Content-addressed blob store on the local filesystem (spec 119).
 *
 * Layout: `<root>/<sha[0:2]>/<sha256>`, root = `~/.shep/objects` in
 * production. Writes go to a temp file in the same directory and are renamed
 * into place, so a crash never leaves a partial blob under its final name.
 * Files are 0600 and directories 0700: blobs can hold source and tool output.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BlobNotFoundError,
  type BlobRef,
  type BlobStat,
  type IBlobStore,
} from '../../../../application/ports/output/harness/index.js';

const REF_PREFIX = 'sha256:';
const HEX_SHA256 = /^[0-9a-f]{64}$/;
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

function toBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
}

export class FileSystemBlobStore implements IBlobStore {
  constructor(private readonly root: string) {}

  async put(data: string | Uint8Array): Promise<BlobRef> {
    const bytes = toBytes(data);
    const hex = createHash('sha256').update(bytes).digest('hex');
    const ref = `${REF_PREFIX}${hex}`;
    const target = this.pathFor(hex);
    if (await this.fileExists(target)) return ref;
    const dir = join(this.root, hex.slice(0, 2));
    await mkdir(dir, { recursive: true, mode: DIR_MODE });
    const tmp = join(dir, `.${hex}.${randomUUID()}.tmp`);
    try {
      await writeFile(tmp, bytes, { mode: FILE_MODE });
      await rename(tmp, target);
    } catch (error) {
      await rm(tmp, { force: true });
      throw error;
    }
    return ref;
  }

  async get(ref: BlobRef): Promise<Uint8Array> {
    try {
      return await readFile(this.pathFor(this.hexOf(ref)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new BlobNotFoundError(ref);
      throw error;
    }
  }

  async getText(ref: BlobRef): Promise<string> {
    return Buffer.from(await this.get(ref)).toString('utf8');
  }

  async exists(ref: BlobRef): Promise<boolean> {
    return this.fileExists(this.pathFor(this.hexOf(ref)));
  }

  async stat(ref: BlobRef): Promise<BlobStat | null> {
    try {
      const s = await stat(this.pathFor(this.hexOf(ref)));
      return { ref, sizeBytes: s.size };
    } catch {
      return null;
    }
  }

  private hexOf(ref: BlobRef): string {
    const hex = ref.startsWith(REF_PREFIX) ? ref.slice(REF_PREFIX.length) : '';
    if (!HEX_SHA256.test(hex)) throw new BlobNotFoundError(ref);
    return hex;
  }

  private pathFor(hex: string): string {
    return join(this.root, hex.slice(0, 2), hex);
  }

  private async fileExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
}

/** In-memory blob store for tests and the scripted backend. */
export class InMemoryBlobStore implements IBlobStore {
  private readonly blobs = new Map<string, Uint8Array>();

  async put(data: string | Uint8Array): Promise<BlobRef> {
    const bytes = toBytes(data);
    const ref = `${REF_PREFIX}${createHash('sha256').update(bytes).digest('hex')}`;
    if (!this.blobs.has(ref)) this.blobs.set(ref, bytes);
    return ref;
  }

  async get(ref: BlobRef): Promise<Uint8Array> {
    const found = this.blobs.get(ref);
    if (!found) throw new BlobNotFoundError(ref);
    return found;
  }

  async getText(ref: BlobRef): Promise<string> {
    return Buffer.from(await this.get(ref)).toString('utf8');
  }

  async exists(ref: BlobRef): Promise<boolean> {
    return this.blobs.has(ref);
  }

  async stat(ref: BlobRef): Promise<BlobStat | null> {
    const found = this.blobs.get(ref);
    return found ? { ref, sizeBytes: found.byteLength } : null;
  }
}
