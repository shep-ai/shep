/**
 * Codex CLI rollout file discovery.
 *
 * Locating rollout files on disk is a separate concern from parsing them, so
 * it lives apart from CodexCliSessionRepository (which was past the project's
 * ~300-line file limit).
 *
 * Structure: $CODEX_HOME/sessions/YYYY/MM/DD/rollout-<timestamp>-<id>.jsonl
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/** A rollout file candidate, with the mtime used for recency sorting. */
export interface CodexRolloutFileInfo {
  id: string;
  filePath: string;
  mtime: Date;
}

type SessionFileInfo = CodexRolloutFileInfo;

export class CodexRolloutFiles {
  constructor(private readonly basePath: string) {}

  /**
   * Recursively collect all rollout .jsonl files from the sessions/ directory.
   * Structure: sessions/YYYY/MM/DD/rollout-<timestamp>-<id>.jsonl
   */
  async collectSessionFiles(): Promise<SessionFileInfo[]> {
    const sessionsDir = path.join(this.basePath, 'sessions');
    const fileInfos: SessionFileInfo[] = [];

    try {
      await this.walkDirectory(sessionsDir, fileInfos);
    } catch {
      // sessions directory doesn't exist
    }

    return fileInfos;
  }

  /** Recursively walk a directory tree collecting .jsonl rollout files */
  private async walkDirectory(dir: string, results: SessionFileInfo[]): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true, encoding: 'utf-8' });
    } catch {
      return;
    }

    const promises: Promise<void>[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        promises.push(this.walkDirectory(fullPath, results));
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.jsonl') &&
        entry.name.startsWith('rollout-')
      ) {
        promises.push(
          fs
            .stat(fullPath)
            .then((stat) => {
              const sessionId = CodexRolloutFiles.sessionIdOf(entry.name);
              if (sessionId) {
                results.push({ id: sessionId, filePath: fullPath, mtime: stat.mtime });
              }
            })
            .catch(() => {
              // Skip files we can't stat
            })
        );
      }
    }

    await Promise.allSettled(promises);
  }

  /**
   * Extract session ID from a rollout filename.
   * Format: rollout-YYYY-MM-DDTHH-MM-SS-<session-id>.jsonl
   * The session ID is the UUID portion after the timestamp.
   */
  static sessionIdOf(filename: string): string | null {
    // rollout-2026-03-24T12-25-16-019d1f60-95de-7141-a648-e3e2fe3da012.jsonl
    // The UUID starts after the timestamp prefix (rollout-YYYY-MM-DDTHH-MM-SS-)
    const withoutExt = filename.replace(/\.jsonl$/, '');
    // Match: rollout-<date>T<time>-<uuid>
    const match = withoutExt.match(/^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(.+)$/);
    return match ? match[1] : null;
  }

  /**
   * Find a session rollout file by ID.
   * Scans the sessions/ directory recursively for a file containing the given ID.
   */
  async findSessionFile(id: string): Promise<{ filePath: string; resolvedId: string } | null> {
    const fileInfos = await this.collectSessionFiles();

    // Exact match first
    for (const fi of fileInfos) {
      if (fi.id === id) {
        return { filePath: fi.filePath, resolvedId: fi.id };
      }
    }

    // Prefix match
    const matches = fileInfos.filter((fi) => fi.id.startsWith(id));
    if (matches.length === 1) {
      return { filePath: matches[0].filePath, resolvedId: matches[0].id };
    }

    return null;
  }
}
