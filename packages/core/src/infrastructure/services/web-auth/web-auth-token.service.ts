/**
 * Web Auth Token Service
 *
 * The control-center web UI listens on loopback, but loopback is not a trust
 * boundary: every page the operator visits can issue requests to it, and every
 * process on the machine can reach the port. The daemon therefore holds a
 * per-install bearer token, generated on first run and persisted inside
 * SHEP_HOME with owner-only permissions.
 *
 * This module is deliberately dependency-free (Node built-ins only) so it can
 * be imported from Next.js middleware, which runs outside the DI container and
 * before any route handler has had a chance to bootstrap it. It follows the
 * same "plain function module" shape as `filesystem/shep-directory.service.ts`,
 * which web routes already import directly.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { getShepHomeDir } from '../filesystem/shep-directory.service';

/** Filename of the token inside SHEP_HOME. */
export const WEB_AUTH_TOKEN_FILENAME = 'web-auth-token';

/** Entropy of a freshly generated token, in bytes (hex-encoded on disk). */
export const WEB_AUTH_TOKEN_BYTE_LENGTH = 32;

/** Owner read/write only — the token is equivalent to shell access. */
export const WEB_AUTH_TOKEN_FILE_MODE = 0o600;

/** Owner-only directory mode, matching `ensureShepDirectory()`. */
const SHEP_HOME_DIR_MODE = 0o700;

/**
 * Cache keyed by the resolved token path so a SHEP_HOME change (test
 * isolation, or a user pointing the daemon at a different home) is picked up
 * instead of being served a stale token from a previous location.
 */
let cachedTokenPath: string | null = null;
let cachedToken: string | null = null;

/**
 * Absolute path of the per-install web auth token.
 */
export function getWebAuthTokenPath(): string {
  return join(getShepHomeDir(), WEB_AUTH_TOKEN_FILENAME);
}

/**
 * Read the persisted token, generating and storing one on first run.
 *
 * A missing, empty, or whitespace-only file is treated as "no token yet" and
 * replaced, so a truncated write can never downgrade the daemon to an
 * empty-string secret that an attacker could present.
 */
export function getOrCreateWebAuthToken(): string {
  const tokenPath = getWebAuthTokenPath();

  if (cachedToken !== null && cachedTokenPath === tokenPath) {
    return cachedToken;
  }

  const existing = readExistingToken(tokenPath);
  const token = existing ?? createAndPersistToken(tokenPath);

  cachedTokenPath = tokenPath;
  cachedToken = token;
  return token;
}

function readExistingToken(tokenPath: string): string | null {
  if (!existsSync(tokenPath)) {
    return null;
  }

  try {
    const contents = readFileSync(tokenPath, 'utf-8').trim();
    return contents.length > 0 ? contents : null;
  } catch {
    // Unreadable token file — fall through and mint a new one rather than
    // leaving the daemon with no credential at all.
    return null;
  }
}

function createAndPersistToken(tokenPath: string): string {
  const token = randomBytes(WEB_AUTH_TOKEN_BYTE_LENGTH).toString('hex');

  const shepHome = getShepHomeDir();
  if (!existsSync(shepHome)) {
    mkdirSync(shepHome, { recursive: true, mode: SHEP_HOME_DIR_MODE });
  }

  writeFileSync(tokenPath, `${token}\n`, { mode: WEB_AUTH_TOKEN_FILE_MODE });
  // `mode` on writeFileSync is only honoured when the file is created, so an
  // existing world-readable file would keep its permissions. chmod is cheap
  // and makes the guarantee unconditional.
  try {
    chmodSync(tokenPath, WEB_AUTH_TOKEN_FILE_MODE);
  } catch {
    // Filesystems without POSIX modes (Windows, some network mounts) — the
    // directory itself is already owner-only.
  }

  return token;
}

/**
 * Constant-time comparison of a candidate credential against the real token.
 *
 * Length differences and missing candidates are rejected before the compare so
 * `timingSafeEqual` never throws on mismatched buffer lengths. The length of
 * the token is not a secret, so leaking it through an early return is fine.
 */
export function timingSafeTokenEquals(
  expected: string,
  candidate: string | null | undefined
): boolean {
  if (!expected || !candidate) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, 'utf-8');
  const candidateBuffer = Buffer.from(candidate, 'utf-8');

  if (expectedBuffer.length !== candidateBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, candidateBuffer);
}
