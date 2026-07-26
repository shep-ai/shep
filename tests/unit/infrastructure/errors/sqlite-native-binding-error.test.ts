import { describe, it, expect } from 'vitest';

import {
  SqliteNativeBindingError,
  SqliteNativeBindingErrorCode,
  isSqliteNativeBindingError,
  toSqliteNativeBindingError,
} from '@/infrastructure/errors/sqlite-native-binding-error.js';

/**
 * The real error better-sqlite3 throws when the compiled `.node` addon is
 * absent (e.g. install scripts were skipped, or no prebuilt binary exists
 * for the running Node ABI). Trimmed from a real report on Node 24 / arm64.
 */
const BINDINGS_NOT_FOUND_MESSAGE = [
  'Could not locate the bindings file. Tried:',
  ' → /usr/lib/node_modules/@shepai/cli/node_modules/better-sqlite3/build/better_sqlite3.node',
  ' → /usr/lib/node_modules/@shepai/cli/node_modules/better-sqlite3/lib/binding/node-v137-darwin-arm64/better_sqlite3.node',
].join('\n');

/**
 * The error thrown when a prebuilt/compiled binary exists but targets a
 * different Node ABI than the runtime (typical after a Node upgrade).
 */
const ABI_MISMATCH_MESSAGE =
  'The module was compiled against a different Node.js version using ' +
  'NODE_MODULE_VERSION 127. This version of Node.js requires ' +
  'NODE_MODULE_VERSION 137. Please try re-compiling or re-installing the module.';

describe('isSqliteNativeBindingError', () => {
  it('detects the "Could not locate the bindings file" failure', () => {
    expect(isSqliteNativeBindingError(new Error(BINDINGS_NOT_FOUND_MESSAGE))).toBe(true);
  });

  it('detects a NODE_MODULE_VERSION ABI mismatch', () => {
    expect(isSqliteNativeBindingError(new Error(ABI_MISMATCH_MESSAGE))).toBe(true);
  });

  it('detects an ERR_DLOPEN_FAILED code on the error', () => {
    const err = Object.assign(new Error('dlopen failed'), { code: 'ERR_DLOPEN_FAILED' });
    expect(isSqliteNativeBindingError(err)).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(isSqliteNativeBindingError(new Error('database is locked'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isSqliteNativeBindingError(null)).toBe(false);
    expect(isSqliteNativeBindingError(undefined)).toBe(false);
    expect(isSqliteNativeBindingError('Could not locate the bindings file')).toBe(false);
  });
});

describe('toSqliteNativeBindingError', () => {
  it('wraps the raw error, preserving it as the cause', () => {
    const raw = new Error(BINDINGS_NOT_FOUND_MESSAGE);
    const wrapped = toSqliteNativeBindingError(raw);

    expect(wrapped).toBeInstanceOf(SqliteNativeBindingError);
    expect(wrapped.name).toBe('SqliteNativeBindingError');
    expect(wrapped.cause).toBe(raw);
  });

  it('classifies a missing-bindings error as BINDINGS_NOT_FOUND', () => {
    const wrapped = toSqliteNativeBindingError(new Error(BINDINGS_NOT_FOUND_MESSAGE));
    expect(wrapped.code).toBe(SqliteNativeBindingErrorCode.BINDINGS_NOT_FOUND);
  });

  it('classifies an ABI mismatch as ABI_MISMATCH', () => {
    const wrapped = toSqliteNativeBindingError(new Error(ABI_MISMATCH_MESSAGE));
    expect(wrapped.code).toBe(SqliteNativeBindingErrorCode.ABI_MISMATCH);
  });

  it('produces actionable, cross-platform remediation', () => {
    const wrapped = toSqliteNativeBindingError(new Error(BINDINGS_NOT_FOUND_MESSAGE));

    // Names the failing module and the primary fix command.
    expect(wrapped.remediation).toContain('better-sqlite3');
    expect(wrapped.remediation).toContain('npm rebuild');
    // Mentions the running Node version so users can spot ABI churn.
    expect(wrapped.remediation).toContain(process.version);
  });

  it('gives a concise, human-readable headline as the message', () => {
    const wrapped = toSqliteNativeBindingError(new Error(BINDINGS_NOT_FOUND_MESSAGE));
    expect(wrapped.message.toLowerCase()).toContain('native');
    // The headline stays short — the detail lives in `remediation`.
    expect(wrapped.message).not.toContain('\n');
  });
});
