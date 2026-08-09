// @vitest-environment node

/**
 * readManifest Unit Tests
 *
 * Every ecosystem detector reads its manifest through this one helper, so its
 * failure contract IS the detectors' failure contract (NFR-4: an expected
 * failure must be a fall-through, never a throw).
 *
 * Real filesystem fixtures, not mocks of node:fs — the point is that the
 * stat-before-read gate and the size cap genuinely fire (NFR-9).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readManifest,
  MAX_MANIFEST_BYTES,
} from '@/infrastructure/services/deployment/detectors/shared/manifest-read.js';

const dirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'shep-manifest-read-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  while (dirs.length) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
});

describe('readManifest', () => {
  it('returns the file contents when the file exists and is within the size cap', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'Makefile'), 'dev:\n\tnpm run dev\n');

    expect(readManifest(join(dir, 'Makefile'))).toBe('dev:\n\tnpm run dev\n');
  });

  it('returns null for a missing file without throwing', () => {
    const dir = makeTempDir();
    expect(readManifest(join(dir, 'nope.toml'))).toBeNull();
  });

  it('returns null for a directory path without throwing', () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, 'Makefile'));
    expect(readManifest(join(dir, 'Makefile'))).toBeNull();
  });

  it('returns null for a file larger than MAX_MANIFEST_BYTES', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'huge.lock'), 'x'.repeat(MAX_MANIFEST_BYTES + 1));
    expect(readManifest(join(dir, 'huge.lock'))).toBeNull();
  });

  it('reads a file exactly at the size cap', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'edge.lock'), 'x'.repeat(MAX_MANIFEST_BYTES));
    expect(readManifest(join(dir, 'edge.lock'))?.length).toBe(MAX_MANIFEST_BYTES);
  });

  it('returns an empty string for an empty file (present but declares nothing)', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'Gemfile'), '');
    expect(readManifest(join(dir, 'Gemfile'))).toBe('');
  });

  it('normalises CRLF to LF so line-anchored scans work on Windows checkouts', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'Makefile'), 'dev:\r\n\tnpm run dev\r\n');

    const content = readManifest(join(dir, 'Makefile'));
    expect(content).toBe('dev:\n\tnpm run dev\n');
    expect(content).not.toContain('\r');
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'returns null for an unreadable file (EACCES) without throwing',
    () => {
      const dir = makeTempDir();
      const filePath = join(dir, 'secret.toml');
      writeFileSync(filePath, '[tool.poetry]');
      chmodSync(filePath, 0o000);

      try {
        expect(readManifest(filePath)).toBeNull();
      } finally {
        chmodSync(filePath, 0o644);
      }
    }
  );
});
