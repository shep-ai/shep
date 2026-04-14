import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  loadOrCreateSecretKey,
  secretKeyFilePath,
  SECRET_KEY_FILENAME,
} from '@/infrastructure/services/crypto/secret-key-file.js';
import { LOCAL_SECRET_KEY_BYTES } from '@/infrastructure/services/crypto/local-secret-box.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'shep-secret-key-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('secretKeyFilePath', () => {
  it('resolves under the provided shep home dir', () => {
    expect(secretKeyFilePath(dir)).toBe(join(dir, SECRET_KEY_FILENAME));
  });
});

describe('loadOrCreateSecretKey', () => {
  it('generates a 32-byte key on first call and writes the file', () => {
    const key = loadOrCreateSecretKey(dir);
    expect(key.length).toBe(LOCAL_SECRET_KEY_BYTES);
    const onDisk = readFileSync(secretKeyFilePath(dir));
    expect(onDisk.equals(key)).toBe(true);
  });

  it('reads the same key on subsequent calls', () => {
    const first = loadOrCreateSecretKey(dir);
    const second = loadOrCreateSecretKey(dir);
    expect(second.equals(first)).toBe(true);
  });

  it('throws when the existing file has the wrong length', () => {
    writeFileSync(secretKeyFilePath(dir), Buffer.alloc(16));
    expect(() => loadOrCreateSecretKey(dir)).toThrow(/invalid length/);
  });
});
