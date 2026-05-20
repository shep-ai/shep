/**
 * Default IFileTreeReaderPort adapter (Phase 11). Walks the local working
 * tree under the repo root, skipping standard ignore directories +
 * user-supplied glob excludes, and reads each file's content into memory.
 *
 * Local-branch-only scope (research decision Phase 11): the adapter NEVER
 * reaches outside `repoRoot`; symlinks pointing outside are skipped.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type {
  IFileTreeReaderPort,
  ReadScanFilesInput,
} from '../../../application/ports/output/services/file-tree-reader-port.interface';
import type { ScanInputFile } from '../../../domain/aspm/scan/scan-input';

const DEFAULT_EXCLUDED_DIRS = new Set<string>([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'out',
  'coverage',
  '.cache',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  '.gradle',
  '.idea',
  '.vscode',
]);
const DEFAULT_MAX_BYTES = 256 * 1024; // 256KB per file

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.icns',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.7z',
  '.rar',
  '.mp3',
  '.mp4',
  '.mov',
  '.webm',
  '.avi',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
]);

function isBinaryByExtension(path: string): boolean {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot >= 0 && BINARY_EXTENSIONS.has(lower.slice(dot));
}

function isExcluded(name: string, excludes: readonly string[]): boolean {
  if (DEFAULT_EXCLUDED_DIRS.has(name)) return true;
  for (const glob of excludes) {
    // Simple glob: support `*` wildcards via regex.
    const regex = new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    if (regex.test(name)) return true;
  }
  return false;
}

export class FileTreeReader implements IFileTreeReaderPort {
  async read(input: ReadScanFilesInput): Promise<ScanInputFile[]> {
    const excludes = input.excludes ?? [];
    const maxBytes = input.maxFileBytes ?? DEFAULT_MAX_BYTES;
    const out: ScanInputFile[] = [];
    this.walk(input.repoRoot, input.repoRoot, excludes, maxBytes, out);
    return out;
  }

  private walk(
    root: string,
    dir: string,
    excludes: readonly string[],
    maxBytes: number,
    out: ScanInputFile[]
  ): void {
    let entries: { name: string; isDir: boolean; isFile: boolean }[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }).map((e) => ({
        name: e.name,
        isDir: e.isDirectory(),
        isFile: e.isFile(),
      }));
    } catch {
      return;
    }

    for (const entry of entries) {
      if (isExcluded(entry.name, excludes)) continue;
      const fullPath = join(dir, entry.name);

      if (entry.isDir) {
        this.walk(root, fullPath, excludes, maxBytes, out);
        continue;
      }
      if (!entry.isFile) continue;
      if (isBinaryByExtension(entry.name)) continue;

      let size: number;
      try {
        size = statSync(fullPath).size;
      } catch {
        continue;
      }
      if (size > maxBytes) continue;

      let content: string;
      try {
        content = readFileSync(fullPath, 'utf8');
      } catch {
        continue;
      }

      const relativePath = relative(root, fullPath).replace(/\\/g, '/');
      out.push({ path: relativePath, content });
    }
  }
}
