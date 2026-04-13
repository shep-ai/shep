/**
 * LocalSecretBox
 *
 * Tiny, zero-dependency AES-256-GCM wrapper used to encrypt per-provider
 * cloud API tokens at rest in the local SQLite database.
 *
 * Threat model: local-machine confidentiality. Protects the token against
 * casual filesystem reads (e.g. another logged-in process on the same
 * machine that does not run as the same user). It does NOT protect against
 * a root-level attacker or a backup-theft scenario — those require a
 * higher-level secret store.
 *
 * Spec 089 (one-click-cloud-deploy) research §2.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const LOCAL_SECRET_KEY_BYTES = 32;
export const LOCAL_SECRET_IV_BYTES = 12;
export const LOCAL_SECRET_TAG_BYTES = 16;

export interface EncryptedBlob {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

export class LocalSecretBox {
  constructor(private readonly key: Buffer) {
    if (key.length !== LOCAL_SECRET_KEY_BYTES) {
      throw new Error(
        `LocalSecretBox key must be exactly ${LOCAL_SECRET_KEY_BYTES} bytes (got ${key.length})`
      );
    }
  }

  encrypt(plaintext: string): EncryptedBlob {
    const iv = randomBytes(LOCAL_SECRET_IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv, {
      authTagLength: LOCAL_SECRET_TAG_BYTES,
    });
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return { ciphertext, iv, tag: cipher.getAuthTag() };
  }

  decrypt(blob: EncryptedBlob): string {
    if (blob.iv.length !== LOCAL_SECRET_IV_BYTES) {
      throw new Error(`LocalSecretBox iv must be ${LOCAL_SECRET_IV_BYTES} bytes`);
    }
    if (blob.tag.length !== LOCAL_SECRET_TAG_BYTES) {
      throw new Error(`LocalSecretBox tag must be ${LOCAL_SECRET_TAG_BYTES} bytes`);
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, blob.iv, {
      authTagLength: LOCAL_SECRET_TAG_BYTES,
    });
    decipher.setAuthTag(blob.tag);
    return decipher.update(blob.ciphertext, undefined, 'utf8') + decipher.final('utf8');
  }
}
