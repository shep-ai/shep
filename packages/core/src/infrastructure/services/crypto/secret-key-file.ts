/**
 * SecretKeyFile
 *
 * Loads (or atomically creates) the 32-byte symmetric key used by
 * LocalSecretBox to encrypt cloud provider tokens at rest.
 *
 * File layout: <shepHomeDir>/secret.key — raw 32 bytes, mode 0o600.
 *
 * On POSIX the `mode` option on writeFileSync enforces owner-only perms.
 * On Windows file mode is mostly advisory; we rely on the parent
 * ~/.shep/ directory being user-only (already set to 0o700 by the
 * shep-directory service), which is the same boundary the existing
 * SQLite database and settings file rely on.
 */

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { LOCAL_SECRET_KEY_BYTES } from './local-secret-box.js';

export const SECRET_KEY_FILENAME = 'secret.key';

export function secretKeyFilePath(shepHomeDir: string): string {
  return join(shepHomeDir, SECRET_KEY_FILENAME);
}

/**
 * Return the 32-byte secret key, generating it atomically on first use.
 *
 * Safe to call multiple times — subsequent calls read the cached file.
 */
export function loadOrCreateSecretKey(shepHomeDir: string): Buffer {
  const path = secretKeyFilePath(shepHomeDir);
  try {
    const key = randomBytes(LOCAL_SECRET_KEY_BYTES);
    writeFileSync(path, key, { mode: 0o600, flag: 'wx' });
    return key;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST') throw err;
    // Another process (or a previous invocation) already generated the key.
    const existing = readFileSync(path);
    if (existing.length !== LOCAL_SECRET_KEY_BYTES) {
      throw new Error(
        `Existing secret key at ${path} has invalid length ${existing.length} (expected ${LOCAL_SECRET_KEY_BYTES})`
      );
    }
    return existing;
  }
}
