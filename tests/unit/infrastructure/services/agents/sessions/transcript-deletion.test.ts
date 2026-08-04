/**
 * transcript-deletion Unit Tests
 *
 * The containment check is the security-relevant part of session deletion:
 * session ids come from filenames on disk, so a crafted id must never let a
 * delete escape the provider's own root.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  deleteTranscriptPath,
  isInsideRoot,
  TranscriptOutsideProviderRootError,
} from '@/infrastructure/services/agents/sessions/transcript-deletion.js';

describe('isInsideRoot', () => {
  it('accepts a path nested inside the root', () => {
    expect(isInsideRoot('/root/a/b.jsonl', '/root')).toBe(true);
  });

  it('rejects the root itself', () => {
    expect(isInsideRoot('/root', '/root')).toBe(false);
  });

  it('rejects a sibling directory sharing a name prefix', () => {
    // /rootless must not count as inside /root
    expect(isInsideRoot('/rootless/a.jsonl', '/root')).toBe(false);
  });

  it('rejects a traversal escape', () => {
    expect(isInsideRoot('/root/../etc/passwd', '/root')).toBe(false);
  });

  it('rejects an unrelated absolute path', () => {
    expect(isInsideRoot('/etc/passwd', '/root')).toBe(false);
  });
});

describe('deleteTranscriptPath', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'shep-del-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('deletes a file inside the root', async () => {
    const file = join(root, 'a.jsonl');
    writeFileSync(file, '{}');

    expect(await deleteTranscriptPath(file, root)).toBe(true);
    expect(existsSync(file)).toBe(false);
  });

  it('deletes a directory inside the root', async () => {
    const dir = join(root, 'transcript-1');
    mkdirSync(dir);
    writeFileSync(join(dir, 'transcript-1.jsonl'), '{}');

    expect(await deleteTranscriptPath(dir, root)).toBe(true);
    expect(existsSync(dir)).toBe(false);
  });

  it('returns false when the target does not exist', async () => {
    expect(await deleteTranscriptPath(join(root, 'missing.jsonl'), root)).toBe(false);
  });

  it('throws rather than deleting a path outside the root', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'shep-other-'));
    const file = join(outside, 'victim.jsonl');
    writeFileSync(file, '{}');

    await expect(deleteTranscriptPath(file, root)).rejects.toThrow(
      TranscriptOutsideProviderRootError
    );
    // The file must survive the refusal.
    expect(existsSync(file)).toBe(true);
    rmSync(outside, { recursive: true, force: true });
  });

  it('throws rather than deleting the provider root itself', async () => {
    await expect(deleteTranscriptPath(root, root)).rejects.toThrow(
      TranscriptOutsideProviderRootError
    );
    expect(existsSync(root)).toBe(true);
  });
});
