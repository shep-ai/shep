// @vitest-environment node

/**
 * ShepInstanceService Unit Tests
 *
 * Verifies same-instance detection: canonicalizes both the running
 * Shep path and the requested target path via realpathSync and
 * compares after normalizing separators to forward slashes.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { ShepInstanceService } from '@/infrastructure/services/shep-instance.service.js';

describe('ShepInstanceService', () => {
  let tmpRoot: string;
  let instancePath: string;
  let otherPath: string;
  let originalEnv: string | undefined;
  let originalLegacyEnv: string | undefined;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'shep-instance-test-'));
    instancePath = join(tmpRoot, 'repo-a');
    otherPath = join(tmpRoot, 'repo-b');
    mkdirSync(instancePath);
    mkdirSync(otherPath);

    originalEnv = process.env.SHEP_INSTANCE_PATH;
    originalLegacyEnv = process.env.NEXT_PUBLIC_SHEP_INSTANCE_PATH;
    process.env.SHEP_INSTANCE_PATH = instancePath;
    delete process.env.NEXT_PUBLIC_SHEP_INSTANCE_PATH;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.SHEP_INSTANCE_PATH;
    else process.env.SHEP_INSTANCE_PATH = originalEnv;
    if (originalLegacyEnv === undefined) delete process.env.NEXT_PUBLIC_SHEP_INSTANCE_PATH;
    else process.env.NEXT_PUBLIC_SHEP_INSTANCE_PATH = originalLegacyEnv;
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('returns true for the exact running instance path', () => {
    const service = new ShepInstanceService();
    expect(service.isSameInstance(instancePath)).toBe(true);
  });

  it('returns true when target uses a trailing separator', () => {
    const service = new ShepInstanceService();
    expect(service.isSameInstance(instancePath + sep)).toBe(true);
  });

  it('returns true when SHEP_INSTANCE_PATH is unset and process.cwd() matches', () => {
    delete process.env.SHEP_INSTANCE_PATH;
    // realpathSync(cwd) will match realpathSync(cwd)
    const service = new ShepInstanceService();
    expect(service.isSameInstance(process.cwd())).toBe(true);
  });

  it('returns false for a different directory', () => {
    const service = new ShepInstanceService();
    expect(service.isSameInstance(otherPath)).toBe(false);
  });

  it('returns false for a non-existent target path', () => {
    const service = new ShepInstanceService();
    expect(service.isSameInstance(join(tmpRoot, 'does-not-exist'))).toBe(false);
  });

  it('resolves symlinks before comparison (POSIX only)', () => {
    if (process.platform === 'win32') {
      // symlinks on Windows require elevated privileges
      return;
    }
    const link = join(tmpRoot, 'link-to-instance');
    symlinkSync(realpathSync(instancePath), link, 'dir');

    const service = new ShepInstanceService();
    expect(service.isSameInstance(link)).toBe(true);
  });

  it('falls back to legacy NEXT_PUBLIC_SHEP_INSTANCE_PATH when SHEP_INSTANCE_PATH unset', () => {
    delete process.env.SHEP_INSTANCE_PATH;
    process.env.NEXT_PUBLIC_SHEP_INSTANCE_PATH = instancePath;
    const service = new ShepInstanceService();
    expect(service.isSameInstance(instancePath)).toBe(true);
    expect(service.isSameInstance(otherPath)).toBe(false);
  });
});
