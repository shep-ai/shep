/**
 * Claude Code session file collection.
 *
 * Locating transcript files on disk is a separate concern from parsing them, so
 * it lives in its own class — ClaudeCodeSessionRepository was past the project's
 * ~300-line file limit once worktree discovery was added.
 *
 * Uses a stat-then-parse strategy: every candidate file is stat'ed in parallel
 * for mtime-based sorting, and only the top-N are handed back for full parsing.
 */

import * as fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  encodeClaudeProjectDir,
  shepWorktreeRepoHash,
} from '../../../../domain/shared/agent-session-paths.js';

/** A transcript file candidate, with the mtime used for recency sorting. */
export interface SessionFileInfo {
  id: string;
  filePath: string;
  mtime: Date;
}

export class ClaudeCodeSessionFileCollector {
  constructor(private readonly basePath: string) {}

  /**
   * Collect session files only from the directory matching the given project path.
   * Claude Code encodes project paths as directory names by replacing '/', '\', and '.'
   * with '-'. e.g. /home/user/.shep/repos/abc/wt/feat-x → -home-user--shep-repos-abc-wt-feat-x
   * This avoids scanning all 100+ project directories.
   */
  async collectSessionFilesForPath(
    projectPath: string,
    includeWorktrees = false
  ): Promise<SessionFileInfo[]> {
    // Normalize: resolve ~ and convert path separators
    const normalizedPath = projectPath.startsWith('~')
      ? path.join(os.homedir(), projectPath.slice(1))
      : projectPath;
    const dirName = encodeClaudeProjectDir(normalizedPath);
    const projectDir = path.join(this.basePath, dirName);

    let files: SessionFileInfo[] = [];
    try {
      files = await this.collectDepthOneJsonlFiles(projectDir);
    } catch {
      // Directory doesn't exist — no sessions recorded directly in the repo.
    }

    if (!includeWorktrees) return files;

    const worktreeFiles = await this.collectWorktreeSessionFiles(normalizedPath, dirName);

    // A directory can match both rules (prefix and shep-worktree), so dedupe
    // by absolute file path rather than trusting the directory lists.
    const byPath = new Map<string, SessionFileInfo>();
    for (const info of [...files, ...worktreeFiles]) {
      byPath.set(info.filePath, info);
    }
    return [...byPath.values()];
  }

  /**
   * Collect sessions recorded inside worktrees of the given repository.
   *
   * Two conventions apply:
   * 1. Sibling project directories sharing the repo's encoded prefix — this is
   *    how Claude Code names a directory for a worktree nested under the repo.
   * 2. shep's own worktrees, which live at ~/.shep/repos/<hash>/wt/<slug> and
   *    therefore encode to a completely different prefix.
   */
  private async collectWorktreeSessionFiles(
    normalizedPath: string,
    dirName: string
  ): Promise<SessionFileInfo[]> {
    let allDirs: string[];
    try {
      allDirs = (await fs.readdir(this.basePath, { withFileTypes: true, encoding: 'utf-8' }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      // Provider root doesn't exist — no sessions at all.
      return [];
    }

    const shepWorktreePrefix = encodeClaudeProjectDir(
      path.join(os.homedir(), '.shep', 'repos', shepWorktreeRepoHash(normalizedPath))
    );

    const worktreeDirs = allDirs.filter(
      (d) => d !== dirName && (d.startsWith(dirName) || d.startsWith(shepWorktreePrefix))
    );

    const results = await Promise.allSettled(
      worktreeDirs.map((d) => this.collectDepthOneJsonlFiles(path.join(this.basePath, d)))
    );

    const files: SessionFileInfo[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') files.push(...result.value);
    }
    return files;
  }

  /** Collect all depth-1 .jsonl session files with mtime from all project directories */
  async collectSessionFiles(): Promise<SessionFileInfo[]> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(this.basePath, { withFileTypes: true, encoding: 'utf-8' });
    } catch {
      return [];
    }

    const projectDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => path.join(this.basePath, e.name));

    const results = await Promise.allSettled(
      projectDirs.map((dir) => this.collectDepthOneJsonlFiles(dir))
    );

    const fileInfos: SessionFileInfo[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        fileInfos.push(...result.value);
      }
    }
    return fileInfos;
  }

  /** Collect depth-1 .jsonl files from a single project directory with stat for mtime */
  private async collectDepthOneJsonlFiles(projectDir: string): Promise<SessionFileInfo[]> {
    const entries = await fs.readdir(projectDir, { withFileTypes: true, encoding: 'utf-8' });
    const jsonlFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.jsonl'));

    const statResults = await Promise.allSettled(
      jsonlFiles.map(async (e) => {
        const filePath = path.join(projectDir, e.name);
        const stat = await fs.stat(filePath);
        const id = e.name.slice(0, -'.jsonl'.length);
        return { id, filePath, mtime: stat.mtime } satisfies SessionFileInfo;
      })
    );

    const fileInfos: SessionFileInfo[] = [];
    for (const result of statResults) {
      if (result.status === 'fulfilled') {
        fileInfos.push(result.value);
      }
    }
    return fileInfos;
  }

  /**
   * Find a session file by exact or prefix ID match, scanning all project directories.
   * Supports prefix matching so users can pass truncated IDs (e.g. first 8 chars).
   * Returns the match info or null if not found / ambiguous.
   */
  async findSessionFile(id: string): Promise<{ filePath: string; resolvedId: string } | null> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(this.basePath, { withFileTypes: true, encoding: 'utf-8' });
    } catch {
      return null;
    }

    const projectDirs = entries
      .filter((e) => e.isDirectory())
      .map((e) => path.join(this.basePath, e.name));

    // Try exact match first (fast path)
    for (const dir of projectDirs) {
      const filePath = path.join(dir, `${id}.jsonl`);
      try {
        await fs.access(filePath);
        return { filePath, resolvedId: id };
      } catch {
        // Not in this directory
      }
    }

    // Fall back to prefix match
    const matches: { filePath: string; resolvedId: string }[] = [];
    for (const dir of projectDirs) {
      let dirEntries: Dirent[];
      try {
        dirEntries = await fs.readdir(dir, { withFileTypes: true, encoding: 'utf-8' });
      } catch {
        continue;
      }
      for (const e of dirEntries) {
        if (e.isFile() && e.name.endsWith('.jsonl') && e.name.startsWith(id)) {
          const resolvedId = e.name.slice(0, -'.jsonl'.length);
          matches.push({ filePath: path.join(dir, e.name), resolvedId });
        }
      }
    }

    if (matches.length === 1) {
      return matches[0];
    }

    // No match or ambiguous (multiple matches)
    return null;
  }
}
