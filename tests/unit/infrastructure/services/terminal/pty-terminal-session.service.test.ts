import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PtyTerminalSessionService } from '../../../../../packages/core/src/infrastructure/services/terminal/pty-terminal-session.service.js';

describe('PtyTerminalSessionService', () => {
  it('rejects non-existent working directory with ENOENT error', () => {
    const service = new PtyTerminalSessionService();
    const nonExistentPath = '/this/path/does/not/exist/surely';

    expect(() => {
      service.create({ cwd: nonExistentPath });
    }).toThrow(/Working directory does not exist/);
  });

  it('rejects non-directory paths', () => {
    const service = new PtyTerminalSessionService();
    const tempDir = mkdtempSync(join(tmpdir(), 'shep-test-'));
    const filePath = join(tempDir, 'file.txt');

    // Create a file instead of a directory
    writeFileSync(filePath, 'test content');

    try {
      expect(() => {
        service.create({ cwd: filePath });
      }).toThrow(/Working directory is not a directory/);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates terminal successfully with valid working directory', () => {
    const service = new PtyTerminalSessionService();
    const tempDir = mkdtempSync(join(tmpdir(), 'shep-test-'));

    try {
      const result = service.create({
        cwd: tempDir,
        cols: 80,
        rows: 24,
      });

      expect(result.id).toBeDefined();
      expect(result.shell).toBeDefined();
      expect(result.cwd).toBe(tempDir);

      // Clean up the terminal session
      service.close(result.id);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
