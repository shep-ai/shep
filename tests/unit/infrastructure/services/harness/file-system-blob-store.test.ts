import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FileSystemBlobStore,
  InMemoryBlobStore,
} from '@/infrastructure/services/harness/storage/file-system-blob-store.js';
import { BlobNotFoundError } from '@/application/ports/output/harness/index.js';

describe('FileSystemBlobStore', () => {
  let root: string;
  let store: FileSystemBlobStore;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'shep-blobs-'));
    store = new FileSystemBlobStore(root);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('stores identical content once and returns the same ref', async () => {
    const a = await store.put('hello');
    const b = await store.put(Buffer.from('hello'));
    expect(a).toBe(b);
    expect(a).toBe('sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    const shard = readdirSync(root);
    expect(shard).toEqual(['2c']);
    expect(readdirSync(join(root, '2c'))).toHaveLength(1);
  });

  it('round-trips bytes and text', async () => {
    const ref = await store.put('héllo\nworld');
    expect(await store.getText(ref)).toBe('héllo\nworld');
    expect(await store.exists(ref)).toBe(true);
    expect((await store.stat(ref))?.sizeBytes).toBe(Buffer.byteLength('héllo\nworld'));
  });

  it('throws BlobNotFoundError for unknown or malformed refs', async () => {
    await expect(store.get(`sha256:${'0'.repeat(64)}`)).rejects.toBeInstanceOf(BlobNotFoundError);
    await expect(store.get('../../etc/passwd')).rejects.toBeInstanceOf(BlobNotFoundError);
    expect(await store.exists(`sha256:${'1'.repeat(64)}`)).toBe(false);
  });

  it('leaves no temp files behind', async () => {
    await store.put('x');
    const files = readdirSync(join(root, readdirSync(root)[0]));
    expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('writes blobs with mode 0600', async () => {
    const ref = await store.put('secret-ish');
    const hex = ref.slice('sha256:'.length);
    expect(statSync(join(root, hex.slice(0, 2), hex)).mode & 0o777).toBe(0o600);
  });
});

describe('InMemoryBlobStore', () => {
  it('behaves like the filesystem store', async () => {
    const store = new InMemoryBlobStore();
    const ref = await store.put('abc');
    expect(await store.getText(ref)).toBe('abc');
    await expect(store.get('sha256:nope')).rejects.toBeInstanceOf(BlobNotFoundError);
  });
});
