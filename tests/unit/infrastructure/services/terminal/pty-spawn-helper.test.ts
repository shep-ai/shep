import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { removeDirWithRetry } from '@tests/helpers/remove-dir.helper.js';
import {
  ensureSpawnHelperExecutable,
  explainSpawnError,
} from '../../../../../packages/core/src/infrastructure/services/terminal/pty-spawn-helper.js';

const EXEC_BITS = 0o111;
const READ_WRITE_ONLY = 0o644;

function writeHelper(packageDir: string, relativeDir: string): string {
  const dir = join(packageDir, relativeDir);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'spawn-helper');
  writeFileSync(file, '#!/bin/sh\n');
  chmodSync(file, READ_WRITE_ONLY);
  return file;
}

// POSIX permission bits do not exist on Windows, which has no spawn-helper.
describe.skipIf(process.platform === 'win32')('ensureSpawnHelperExecutable', () => {
  let packageDir: string;

  beforeEach(() => {
    packageDir = mkdtempSync(join(tmpdir(), 'shep-pty-helper-'));
  });

  afterEach(() => {
    removeDirWithRetry(packageDir);
  });

  it('makes the prebuilt helper for the running platform executable', () => {
    const helper = writeHelper(packageDir, 'prebuilds/darwin-arm64');

    ensureSpawnHelperExecutable(packageDir, 'darwin', 'arm64');

    expect(statSync(helper).mode & EXEC_BITS).toBe(EXEC_BITS);
  });

  it('makes a helper built from source executable', () => {
    const helper = writeHelper(packageDir, 'build/Release');

    ensureSpawnHelperExecutable(packageDir, 'darwin', 'arm64');

    expect(statSync(helper).mode & EXEC_BITS).toBe(EXEC_BITS);
  });

  it('leaves prebuilds for other platforms alone', () => {
    const helper = writeHelper(packageDir, 'prebuilds/darwin-x64');

    ensureSpawnHelperExecutable(packageDir, 'darwin', 'arm64');

    expect(statSync(helper).mode & EXEC_BITS).toBe(0);
  });

  it('does nothing when the package ships no helper', () => {
    expect(() => ensureSpawnHelperExecutable(packageDir, 'linux', 'x64')).not.toThrow();
  });
});

describe('explainSpawnError', () => {
  it('adds a chmod hint to the bare posix_spawnp failure', () => {
    const message = explainSpawnError('posix_spawnp failed.');

    expect(message).toContain('posix_spawnp failed.');
    expect(message).toMatch(/chmod \+x/);
    expect(message).toContain('spawn-helper');
  });

  it('passes other errors through unchanged', () => {
    expect(explainSpawnError('Unknown spawn error')).toBe('Unknown spawn error');
  });
});
