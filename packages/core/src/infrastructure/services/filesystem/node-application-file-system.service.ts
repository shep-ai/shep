/**
 * Node Application File System Service
 *
 * Infrastructure adapter for `IApplicationFileSystemService` backed by
 * `node:fs`. Confines all operations to a caller-supplied `rootPath` so
 * path traversal is impossible regardless of what the web/cli layer
 * passes in.
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { injectable } from 'tsyringe';

import {
  ApplicationFileSystemError,
  type FileChangeEvent,
  type FileChangeListener,
  type FileTreeEntry,
  type IApplicationFileSystemService,
  type ReadFileBufferResult,
  type ReadFileResult,
  type UnsubscribeFn,
} from '../../../application/ports/output/services/application-file-system-service.interface.js';

/** Directories we never traverse into or surface in the tree. */
const ALWAYS_IGNORED_DIRS = new Set<string>([
  '.git',
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'build',
  'out',
  '.cache',
  '.pnpm-store',
  'coverage',
]);

/** Max bytes we will read into memory for a single file (1 MiB). */
const MAX_FILE_BYTES = 1024 * 1024;

/** Max bytes allowed for the raw-bytes endpoint (10 MiB — covers typical images). */
const MAX_RAW_FILE_BYTES = 10 * 1024 * 1024;

/** Extension → MIME type table for the raw endpoint. Covers common assets. */
const EXTENSION_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

function mimeTypeForPath(filePath: string): string {
  const base = path.basename(filePath).toLowerCase();
  const dot = base.lastIndexOf('.');
  if (dot === -1) return 'application/octet-stream';
  const ext = base.slice(dot + 1);
  return EXTENSION_MIME_TYPES[ext] ?? 'application/octet-stream';
}

/** POSIX-normalized path (always "/"-separated). */
function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Resolve `relativePath` against `rootPath`, rejecting escapes. */
function resolveInside(rootPath: string, relativePath: string): string {
  // Treat empty/"/"/"." as the root itself.
  const cleaned = (relativePath ?? '').replace(/^[/\\]+/, '');
  const absRoot = path.resolve(rootPath);
  const absTarget = path.resolve(absRoot, cleaned);

  const rootWithSep = absRoot.endsWith(path.sep) ? absRoot : absRoot + path.sep;
  if (absTarget !== absRoot && !absTarget.startsWith(rootWithSep)) {
    throw new ApplicationFileSystemError(
      `Path escapes application root: ${relativePath}`,
      'PATH_ESCAPES_ROOT'
    );
  }
  return absTarget;
}

/** Heuristic: a buffer is "binary" if it contains a NUL byte in its first 8 KiB. */
function looksBinary(buf: Buffer): boolean {
  const end = Math.min(buf.length, 8192);
  for (let i = 0; i < end; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

@injectable()
export class NodeApplicationFileSystemService implements IApplicationFileSystemService {
  async listTree(rootPath: string): Promise<FileTreeEntry> {
    const absRoot = path.resolve(rootPath);
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(absRoot);
    } catch {
      throw new ApplicationFileSystemError(
        `Application root does not exist: ${rootPath}`,
        'NOT_FOUND'
      );
    }
    if (!stat.isDirectory()) {
      throw new ApplicationFileSystemError(
        `Application root is not a directory: ${rootPath}`,
        'NOT_A_DIRECTORY'
      );
    }

    const root: FileTreeEntry = {
      name: path.basename(absRoot) || absRoot,
      path: '',
      isDirectory: true,
      children: await this.#readDir(absRoot, ''),
    };
    return root;
  }

  async #readDir(absDir: string, relDir: string): Promise<FileTreeEntry[]> {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(absDir, { withFileTypes: true });
    } catch {
      return [];
    }

    // Sort: directories first, then alphabetical (case-insensitive).
    entries.sort((a, b) => {
      const ad = a.isDirectory() ? 0 : 1;
      const bd = b.isDirectory() ? 0 : 1;
      if (ad !== bd) return ad - bd;
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    const results: FileTreeEntry[] = [];
    for (const entry of entries) {
      if (entry.isDirectory() && ALWAYS_IGNORED_DIRS.has(entry.name)) continue;
      // Skip symlinks (could escape root, not worth following).
      if (entry.isSymbolicLink()) continue;

      const childRel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const childAbs = path.join(absDir, entry.name);

      if (entry.isDirectory()) {
        results.push({
          name: entry.name,
          path: childRel,
          isDirectory: true,
          children: await this.#readDir(childAbs, childRel),
        });
      } else if (entry.isFile()) {
        results.push({
          name: entry.name,
          path: childRel,
          isDirectory: false,
        });
      }
    }
    return results;
  }

  async readFile(rootPath: string, relativePath: string): Promise<ReadFileResult> {
    const abs = resolveInside(rootPath, relativePath);

    let stat: fs.Stats;
    try {
      stat = await fsp.stat(abs);
    } catch {
      throw new ApplicationFileSystemError(`File not found: ${relativePath}`, 'NOT_FOUND');
    }
    if (stat.isDirectory()) {
      throw new ApplicationFileSystemError(`Path is a directory: ${relativePath}`, 'IS_DIRECTORY');
    }

    const posixPath = toPosix(path.relative(path.resolve(rootPath), abs));

    if (stat.size > MAX_FILE_BYTES) {
      return {
        path: posixPath,
        content: '',
        size: stat.size,
        tooLarge: true,
      };
    }

    let buf: Buffer;
    try {
      buf = await fsp.readFile(abs);
    } catch (err) {
      throw new ApplicationFileSystemError(
        `Failed to read file: ${relativePath} (${(err as Error).message})`,
        'IO'
      );
    }

    if (looksBinary(buf)) {
      return {
        path: posixPath,
        content: '',
        size: stat.size,
        binary: true,
      };
    }

    return {
      path: posixPath,
      content: buf.toString('utf8'),
      size: stat.size,
    };
  }

  async readFileBuffer(rootPath: string, relativePath: string): Promise<ReadFileBufferResult> {
    const abs = resolveInside(rootPath, relativePath);

    let stat: fs.Stats;
    try {
      stat = await fsp.stat(abs);
    } catch {
      throw new ApplicationFileSystemError(`File not found: ${relativePath}`, 'NOT_FOUND');
    }
    if (stat.isDirectory()) {
      throw new ApplicationFileSystemError(`Path is a directory: ${relativePath}`, 'IS_DIRECTORY');
    }
    if (stat.size > MAX_RAW_FILE_BYTES) {
      throw new ApplicationFileSystemError(
        `File exceeds raw-read size limit: ${relativePath}`,
        'TOO_LARGE'
      );
    }

    let buffer: Buffer;
    try {
      buffer = await fsp.readFile(abs);
    } catch (err) {
      throw new ApplicationFileSystemError(
        `Failed to read file: ${relativePath} (${(err as Error).message})`,
        'IO'
      );
    }

    return {
      path: toPosix(path.relative(path.resolve(rootPath), abs)),
      buffer,
      size: stat.size,
      mimeType: mimeTypeForPath(abs),
    };
  }

  async writeFile(rootPath: string, relativePath: string, content: string): Promise<void> {
    const abs = resolveInside(rootPath, relativePath);
    try {
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, content, 'utf8');
    } catch (err) {
      throw new ApplicationFileSystemError(
        `Failed to write file: ${relativePath} (${(err as Error).message})`,
        'IO'
      );
    }
  }

  watch(rootPath: string, listener: FileChangeListener): UnsubscribeFn {
    const absRoot = path.resolve(rootPath);

    // `fs.watch` recursive mode is supported on macOS, Windows, and
    // Linux (Node >= 20). On older Linux it throws; we swallow the
    // error and return a no-op to keep presentation code simple.
    let watcher: fs.FSWatcher | null = null;
    try {
      watcher = fs.watch(
        absRoot,
        { recursive: true, persistent: false },
        (_eventType, filename) => {
          if (!filename) return;
          const rel = toPosix(String(filename));
          // Skip anything inside an ignored dir (cheap prefix check).
          const topSegment = rel.split('/')[0];
          if (ALWAYS_IGNORED_DIRS.has(topSegment)) return;

          // `kind` is always assigned in the try/catch below — either
          // 'modified' if the path still exists on disk, or 'deleted'
          // if the stat fails. Initialising it here with a placeholder
          // would be dead code that lint correctly flags as a useless
          // assignment. The `!` on the read below acknowledges that
          // both branches set it before listener() runs.
          let kind: FileChangeEvent['kind'];
          let isDirectory = false;
          try {
            const st = fs.statSync(path.join(absRoot, rel));
            isDirectory = st.isDirectory();
            kind = 'modified'; // heuristic: if it exists now, treat as created-or-modified
          } catch {
            kind = 'deleted';
          }
          listener({ kind, path: rel, isDirectory });
        }
      );
      watcher.on('error', () => {
        // Swallow — watch errors should not crash the caller.
      });
    } catch {
      return () => {
        /* no-op: watch unsupported on this platform */
      };
    }

    return () => {
      try {
        watcher?.close();
      } catch {
        // ignore
      }
    };
  }
}
