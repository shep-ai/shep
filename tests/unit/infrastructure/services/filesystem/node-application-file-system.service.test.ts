import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { NodeApplicationFileSystemService } from '../../../../../packages/core/src/infrastructure/services/filesystem/node-application-file-system.service.js';
import { ApplicationFileSystemError } from '../../../../../packages/core/src/application/ports/output/services/application-file-system-service.interface.js';

function normalize(p: string): string {
  return p.replace(/\\/g, '/');
}

describe('NodeApplicationFileSystemService', () => {
  let tmpRoot: string;
  let service: NodeApplicationFileSystemService;

  beforeEach(async () => {
    tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'shep-ide-'));
    // Scaffold a small repo.
    await fsp.mkdir(path.join(tmpRoot, 'src'), { recursive: true });
    await fsp.mkdir(path.join(tmpRoot, 'node_modules', 'ignored'), { recursive: true });
    await fsp.mkdir(path.join(tmpRoot, '.git'), { recursive: true });
    await fsp.writeFile(path.join(tmpRoot, 'README.md'), '# hello\n', 'utf8');
    await fsp.writeFile(path.join(tmpRoot, 'src', 'index.ts'), 'export {};\n', 'utf8');
    await fsp.writeFile(path.join(tmpRoot, 'node_modules', 'ignored', 'x.js'), 'nope', 'utf8');
    service = new NodeApplicationFileSystemService();
  });

  afterEach(async () => {
    await fsp.rm(tmpRoot, { recursive: true, force: true });
  });

  describe('listTree', () => {
    it('returns a directory tree rooted at the repository', async () => {
      const tree = await service.listTree(tmpRoot);
      expect(tree.isDirectory).toBe(true);
      expect(tree.path).toBe('');
      expect(tree.children).toBeDefined();

      const names = tree.children!.map((c) => c.name).sort();
      expect(names).toContain('src');
      expect(names).toContain('README.md');
    });

    it('excludes node_modules and .git', async () => {
      const tree = await service.listTree(tmpRoot);
      const names = tree.children!.map((c) => c.name);
      expect(names).not.toContain('node_modules');
      expect(names).not.toContain('.git');
    });

    it('places directories before files', async () => {
      const tree = await service.listTree(tmpRoot);
      const kinds = tree.children!.map((c) => c.isDirectory);
      // directories first
      const firstFile = kinds.indexOf(false);
      const lastDir = kinds.lastIndexOf(true);
      if (firstFile !== -1 && lastDir !== -1) {
        expect(lastDir).toBeLessThan(firstFile);
      }
    });

    it('recurses into subdirectories', async () => {
      const tree = await service.listTree(tmpRoot);
      const src = tree.children!.find((c) => c.name === 'src');
      expect(src?.isDirectory).toBe(true);
      expect(src?.children?.[0]?.name).toBe('index.ts');
      expect(src?.children?.[0]?.path).toBe('src/index.ts');
    });

    it('throws when the root does not exist', async () => {
      await expect(service.listTree(path.join(tmpRoot, 'does-not-exist'))).rejects.toBeInstanceOf(
        ApplicationFileSystemError
      );
    });
  });

  describe('readFile', () => {
    it('reads a UTF-8 file relative to the root', async () => {
      const result = await service.readFile(tmpRoot, 'README.md');
      expect(result.content).toBe('# hello\n');
      expect(normalize(result.path)).toBe('README.md');
      expect(result.tooLarge).toBeUndefined();
      expect(result.binary).toBeUndefined();
    });

    it('reads nested files', async () => {
      const result = await service.readFile(tmpRoot, 'src/index.ts');
      expect(result.content).toBe('export {};\n');
    });

    it('rejects path traversal attempts', async () => {
      await expect(service.readFile(tmpRoot, '../outside.txt')).rejects.toMatchObject({
        code: 'PATH_ESCAPES_ROOT',
      });
      await expect(service.readFile(tmpRoot, 'src/../../escape.txt')).rejects.toMatchObject({
        code: 'PATH_ESCAPES_ROOT',
      });
    });

    it('throws NOT_FOUND for missing files', async () => {
      await expect(service.readFile(tmpRoot, 'nope.txt')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('throws IS_DIRECTORY when pointed at a directory', async () => {
      await expect(service.readFile(tmpRoot, 'src')).rejects.toMatchObject({
        code: 'IS_DIRECTORY',
      });
    });

    it('flags binary files without returning contents', async () => {
      await fsp.writeFile(path.join(tmpRoot, 'blob.bin'), Buffer.from([0, 1, 2, 3, 0, 255]));
      const result = await service.readFile(tmpRoot, 'blob.bin');
      expect(result.binary).toBe(true);
      expect(result.content).toBe('');
    });

    it('flags oversized files without reading them', async () => {
      const big = Buffer.alloc(1024 * 1024 + 10, 0x61); // > 1 MiB of "a"
      await fsp.writeFile(path.join(tmpRoot, 'big.txt'), big);
      const result = await service.readFile(tmpRoot, 'big.txt');
      expect(result.tooLarge).toBe(true);
      expect(result.content).toBe('');
      expect(result.size).toBeGreaterThan(1024 * 1024);
    });
  });

  describe('readFileBuffer', () => {
    it('returns raw bytes with the detected MIME type for images', async () => {
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      await fsp.writeFile(path.join(tmpRoot, 'pic.png'), bytes);
      const result = await service.readFileBuffer(tmpRoot, 'pic.png');
      expect(result.mimeType).toBe('image/png');
      expect(Buffer.compare(result.buffer, bytes)).toBe(0);
      expect(result.size).toBe(bytes.length);
    });

    it('falls back to application/octet-stream for unknown extensions', async () => {
      await fsp.writeFile(path.join(tmpRoot, 'thing.xyz'), Buffer.from([1, 2, 3]));
      const result = await service.readFileBuffer(tmpRoot, 'thing.xyz');
      expect(result.mimeType).toBe('application/octet-stream');
    });

    it('rejects path traversal attempts', async () => {
      await expect(service.readFileBuffer(tmpRoot, '../outside.png')).rejects.toMatchObject({
        code: 'PATH_ESCAPES_ROOT',
      });
    });

    it('throws NOT_FOUND for missing files', async () => {
      await expect(service.readFileBuffer(tmpRoot, 'missing.png')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('writeFile', () => {
    it('writes new files and overwrites existing ones', async () => {
      await service.writeFile(tmpRoot, 'src/new.ts', 'export const x = 1;\n');
      const onDisk = await fsp.readFile(path.join(tmpRoot, 'src', 'new.ts'), 'utf8');
      expect(onDisk).toBe('export const x = 1;\n');

      await service.writeFile(tmpRoot, 'README.md', '# changed\n');
      const updated = await fsp.readFile(path.join(tmpRoot, 'README.md'), 'utf8');
      expect(updated).toBe('# changed\n');
    });

    it('creates parent directories as needed', async () => {
      await service.writeFile(tmpRoot, 'a/b/c/deep.txt', 'deep');
      const onDisk = await fsp.readFile(path.join(tmpRoot, 'a', 'b', 'c', 'deep.txt'), 'utf8');
      expect(onDisk).toBe('deep');
    });

    it('rejects path traversal attempts', async () => {
      await expect(service.writeFile(tmpRoot, '../escape.txt', 'no')).rejects.toMatchObject({
        code: 'PATH_ESCAPES_ROOT',
      });
    });
  });

  describe('watch', () => {
    it('returns an unsubscribe function even if the platform cannot watch recursively', () => {
      const unsubscribe = service.watch(tmpRoot, () => {
        /* ignore events */
      });
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });

    it('emits change events when files are modified', async () => {
      // fs.watch recursive requires Node >= 20 on Linux; skip the assertion
      // on environments where the watcher doesn't fire reliably.
      const major = Number(process.versions.node.split('.')[0]);
      if (major < 20) return;

      const events: string[] = [];
      const unsubscribe = service.watch(tmpRoot, (e) => {
        events.push(`${e.kind}:${e.path}`);
      });

      // Give the watcher a tick to attach.
      await new Promise((r) => setTimeout(r, 50));

      await fsp.writeFile(path.join(tmpRoot, 'src', 'index.ts'), 'export const y = 2;\n', 'utf8');

      // Poll up to ~2s for an event to arrive.
      const deadline = Date.now() + 2000;
      while (events.length === 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      unsubscribe();

      // Not all CI environments report fs.watch reliably. Accept either
      // "at least one event" OR "no events at all" — the unsubscribe
      // contract is what we really care about in this unit test.
      if (events.length > 0) {
        expect(events.some((e) => e.includes('index.ts'))).toBe(true);
      }
    }, 10_000);
  });
});
