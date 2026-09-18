import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { removeDirWithRetry } from '@tests/helpers/remove-dir.helper.js';

describe('removeDirWithRetry', () => {
  it('removes a populated directory tree', () => {
    const root = mkdtempSync(join(tmpdir(), 'shep-rmdir-'));
    const nested = join(root, 'nested', 'deeper');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, 'file.txt'), 'contents');

    removeDirWithRetry(root);

    expect(existsSync(root)).toBe(false);
  });

  it('is a no-op for a directory that does not exist', () => {
    const missing = join(tmpdir(), 'shep-rmdir-never-created');

    expect(() => removeDirWithRetry(missing)).not.toThrow();
  });
});
