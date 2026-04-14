import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';

import {
  LocalSecretBox,
  LOCAL_SECRET_KEY_BYTES,
} from '@/infrastructure/services/crypto/local-secret-box.js';

function newKey(): Buffer {
  return randomBytes(LOCAL_SECRET_KEY_BYTES);
}

describe('LocalSecretBox', () => {
  it('rejects keys that are not 32 bytes', () => {
    expect(() => new LocalSecretBox(Buffer.alloc(16))).toThrow(/32 bytes/);
    expect(() => new LocalSecretBox(Buffer.alloc(64))).toThrow(/32 bytes/);
  });

  it('round-trips a plaintext token', () => {
    const box = new LocalSecretBox(newKey());
    const plaintext = 'cf_token_abcdef0123456789';
    const blob = box.encrypt(plaintext);
    expect(blob.iv.length).toBe(12);
    expect(blob.tag.length).toBe(16);
    expect(blob.ciphertext.toString('utf8')).not.toBe(plaintext);
    expect(box.decrypt(blob)).toBe(plaintext);
  });

  it('produces a fresh iv on every encrypt', () => {
    const box = new LocalSecretBox(newKey());
    const a = box.encrypt('same plaintext');
    const b = box.encrypt('same plaintext');
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it('fails to decrypt with a different key', () => {
    const original = new LocalSecretBox(newKey());
    const blob = original.encrypt('secret');
    const attacker = new LocalSecretBox(newKey());
    expect(() => attacker.decrypt(blob)).toThrow();
  });

  it('fails when the ciphertext is tampered with (GCM auth tag mismatch)', () => {
    const box = new LocalSecretBox(newKey());
    const blob = box.encrypt('secret');
    const tampered = {
      ...blob,
      ciphertext: Buffer.concat([blob.ciphertext]),
    };
    tampered.ciphertext[0] ^= 0xff;
    expect(() => box.decrypt(tampered)).toThrow();
  });

  it('fails when the iv has the wrong length', () => {
    const box = new LocalSecretBox(newKey());
    const blob = box.encrypt('secret');
    expect(() => box.decrypt({ ...blob, iv: Buffer.alloc(8) })).toThrow(/iv/);
  });

  it('fails when the auth tag has the wrong length', () => {
    const box = new LocalSecretBox(newKey());
    const blob = box.encrypt('secret');
    expect(() => box.decrypt({ ...blob, tag: Buffer.alloc(8) })).toThrow(/tag/);
  });
});
