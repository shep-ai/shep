/**
 * Log File Store
 *
 * Filesystem adapter over `~/.shep/logs`. Listing tolerates a missing
 * directory and files that vanish mid-walk (a worker can rotate or a
 * `prune` can race); deletion does not, because a prune that silently
 * fails to delete is worse than one that says so.
 */

import { open, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { injectable } from 'tsyringe';

import type {
  ILogFileStore,
  LogFileInfo,
} from '../../../application/ports/output/services/log-file-store.interface.js';
import { getShepHomeDir } from '../filesystem/shep-directory.service.js';

/** Sub-directory of the Shep home holding feature-agent worker logs. */
const LOGS_DIRNAME = 'logs';

/**
 * Bytes read from the end of a file for a tail. Worker log lines can be long
 * (`[tool]` lines carry full tool-input JSON), so this bounds the read rather
 * than the line count: enough for a screen of lines without loading a
 * multi-megabyte log on every refresh.
 */
const TAIL_BYTE_BUDGET = 256 * 1024;

const LINE_BREAK = /\r?\n/;

@injectable()
export class LogFileStoreService implements ILogFileStore {
  getLogsDirectory(): string {
    return join(getShepHomeDir(), LOGS_DIRNAME);
  }

  async list(): Promise<LogFileInfo[]> {
    const directory = this.getLogsDirectory();
    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch {
      // Nothing has ever run, or the directory was removed — not an error.
      return [];
    }

    const files: LogFileInfo[] = [];
    for (const name of entries) {
      const path = join(directory, name);
      try {
        const stats = await stat(path);
        if (!stats.isFile()) continue;
        files.push({ path, name, sizeBytes: stats.size, modifiedAt: new Date(stats.mtimeMs) });
      } catch {
        // Removed between readdir and stat — skip it.
        continue;
      }
    }
    return files;
  }

  async remove(path: string): Promise<void> {
    await unlink(path);
  }

  async readTail(path: string, maxLines: number): Promise<string[]> {
    if (maxLines <= 0) return [];
    let handle;
    try {
      handle = await open(path, 'r');
    } catch {
      // Not written yet — the run has produced no output.
      return [];
    }
    try {
      const { size } = await handle.stat();
      const length = Math.min(size, TAIL_BYTE_BUDGET);
      const start = size - length;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, start);

      const lines = buffer.toString('utf8').split(LINE_BREAK);
      // A read that starts mid-file starts mid-line: drop that partial line.
      if (start > 0) lines.shift();
      // A trailing newline leaves one empty entry at the end.
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
      return lines.slice(-maxLines);
    } finally {
      await handle.close();
    }
  }
}
