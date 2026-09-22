/**
 * Cursor Session Repository
 *
 * Reads Cursor agent transcripts from
 *   ~/.cursor/projects/<encoded-project-path>/agent-transcripts/
 *
 * Two on-disk layouts exist and both must be supported:
 *   1. Flat:   agent-transcripts/<id>.jsonl
 *   2. Nested: agent-transcripts/<id>/<id>.jsonl
 *
 * Cursor's JSONL differs from Claude Code's: `role` sits at the top level of
 * each entry rather than under `message.role`, and there is no `cwd` field, so
 * the project path comes from the directory being scanned rather than the
 * transcript contents.
 *
 * Replaces StubSessionRepository for Cursor (spec 105) — the web session
 * scanner was previously the only code that could see these sessions, and it
 * is being deleted.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { injectable } from 'tsyringe';
import type { AgentSession, AgentType } from '../../../../domain/generated/output.js';
import { encodeCursorProjectDir } from '../../../../domain/shared/agent-session-paths.js';
import { deleteTranscriptPath } from './transcript-deletion.js';
import {
  resolveTimestamp,
  scanTranscript,
  TranscriptSummaryCache,
} from './jsonl-transcript-scanner.js';
import { CursorTranscriptAccumulator } from './cursor-transcript.js';
import type {
  IAgentSessionRepository,
  ListSessionsOptions,
  GetSessionOptions,
} from '../../../../application/ports/output/agents/agent-session-repository.interface.js';

const TRANSCRIPTS_DIR = 'agent-transcripts';
const JSONL_EXT = '.jsonl';

interface TranscriptFile {
  id: string;
  filePath: string;
  mtime: Date;
  /** Absolute project path this transcript belongs to */
  projectPath: string;
}

@injectable()
export class CursorSessionRepository implements IAgentSessionRepository {
  /** List summaries, advanced by the bytes appended since the previous list (spec 116). */
  private readonly summaries = new TranscriptSummaryCache(
    (filePath) => new CursorTranscriptAccumulator(path.basename(filePath, JSONL_EXT), false)
  );

  constructor(private readonly basePath: string = path.join(os.homedir(), '.cursor', 'projects')) {}

  isSupported(): boolean {
    return true;
  }

  async list(options?: ListSessionsOptions): Promise<AgentSession[]> {
    const limit = options?.limit ?? 20;

    const files = options?.projectPath
      ? await this.collectForProject(options.projectPath)
      : await this.collectAll();

    files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    const toParse = limit > 0 ? files.slice(0, limit) : files;

    const results = await Promise.allSettled(
      toParse.map((file) => this.parse(file, { includeMessages: false }))
    );

    const sessions: AgentSession[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value !== null) sessions.push(result.value);
    }
    return sessions;
  }

  /**
   * Delete a Cursor transcript.
   *
   * Cursor uses two layouts: a flat `<id>.jsonl`, or a directory per transcript
   * containing `<id>/<id>.jsonl`. In the nested case the whole directory is
   * removed, since it exists solely to hold that transcript.
   */
  async delete(id: string): Promise<boolean> {
    const match = (await this.collectAll()).find((f) => f.id === id);
    if (!match) return false;

    // Nested layout: the transcript's parent directory is named after the id,
    // so removing the directory removes the transcript.
    const parent = path.dirname(match.filePath);
    const target = path.basename(parent) === id ? parent : match.filePath;

    return deleteTranscriptPath(target, this.basePath);
  }

  async findById(id: string, options?: GetSessionOptions): Promise<AgentSession | null> {
    const messageLimit = options?.messageLimit ?? 20;

    const match = (await this.collectAll()).find((f) => f.id === id);
    if (!match) return null;

    return this.parse(match, { includeMessages: true, messageLimit });
  }

  /** Resolve the transcripts directory for one project path. */
  private async collectForProject(projectPath: string): Promise<TranscriptFile[]> {
    const normalized = projectPath.startsWith('~')
      ? path.join(os.homedir(), projectPath.slice(1))
      : projectPath;

    const dir = path.join(this.basePath, encodeCursorProjectDir(normalized), TRANSCRIPTS_DIR);
    return this.collectFromTranscriptsDir(dir, normalized);
  }

  /** Scan every project directory under the Cursor base path. */
  private async collectAll(): Promise<TranscriptFile[]> {
    let entries;
    try {
      entries = await fs.readdir(this.basePath, { withFileTypes: true, encoding: 'utf-8' });
    } catch {
      return [];
    }

    const projectDirs = entries.filter((e) => e.isDirectory());
    const results = await Promise.allSettled(
      projectDirs.map((e) =>
        this.collectFromTranscriptsDir(
          path.join(this.basePath, e.name, TRANSCRIPTS_DIR),
          // The encoding is lossy (dots removed, separators flattened), so the
          // original path cannot be recovered — report the encoded name.
          e.name
        )
      )
    );

    const files: TranscriptFile[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') files.push(...result.value);
    }
    return files;
  }

  /**
   * Collect transcripts from one agent-transcripts directory, handling both the
   * flat and directory-per-transcript layouts.
   */
  private async collectFromTranscriptsDir(
    transcriptsDir: string,
    projectPath: string
  ): Promise<TranscriptFile[]> {
    let entries;
    try {
      entries = await fs.readdir(transcriptsDir, { withFileTypes: true, encoding: 'utf-8' });
    } catch {
      return [];
    }

    const candidates = await Promise.allSettled(
      entries.map(async (entry): Promise<TranscriptFile | null> => {
        if (entry.isFile() && entry.name.endsWith(JSONL_EXT)) {
          const filePath = path.join(transcriptsDir, entry.name);
          const stat = await fs.stat(filePath);
          return {
            id: entry.name.slice(0, -JSONL_EXT.length),
            filePath,
            mtime: stat.mtime,
            projectPath,
          };
        }

        if (entry.isDirectory()) {
          // Nested layout: <id>/<id>.jsonl
          const filePath = path.join(transcriptsDir, entry.name, `${entry.name}${JSONL_EXT}`);
          try {
            const stat = await fs.stat(filePath);
            return { id: entry.name, filePath, mtime: stat.mtime, projectPath };
          } catch {
            return null;
          }
        }

        return null;
      })
    );

    const files: TranscriptFile[] = [];
    for (const result of candidates) {
      if (result.status === 'fulfilled' && result.value !== null) files.push(result.value);
    }
    return files;
  }

  /**
   * Read a transcript into an AgentSession. The list view folds only the
   * bytes appended since its previous scan; the detail view reads the whole
   * file. Both skip malformed lines and tolerate a half-written last line.
   */
  private async parse(
    file: TranscriptFile,
    options: { includeMessages: boolean; messageLimit?: number }
  ): Promise<AgentSession | null> {
    let transcript: CursorTranscriptAccumulator;
    try {
      transcript = options.includeMessages
        ? await scanTranscript(file.filePath, new CursorTranscriptAccumulator(file.id, true))
        : await this.summaries.summarize(file.filePath);
    } catch {
      return null;
    }

    if (transcript.messageCount === 0) return null;

    const firstMessageAt = resolveTimestamp(transcript.firstTimestamp, file.mtime);
    const lastMessageAt = resolveTimestamp(transcript.lastTimestamp, file.mtime);

    const session: AgentSession = {
      id: file.id,
      agentType: 'cursor' as AgentType,
      projectPath: file.projectPath,
      filePath: file.filePath,
      messageCount: transcript.messageCount,
      createdAt: firstMessageAt ?? file.mtime,
      updatedAt: lastMessageAt ?? file.mtime,
    };

    if (transcript.preview !== undefined) session.preview = transcript.preview;
    if (firstMessageAt !== undefined) session.firstMessageAt = firstMessageAt;
    if (lastMessageAt !== undefined) session.lastMessageAt = lastMessageAt;

    if (options.includeMessages) {
      const messages = transcript.messagesAt(file.mtime);
      const limit = options.messageLimit;
      session.messages = limit !== undefined && limit > 0 ? messages.slice(-limit) : messages;
    }

    return session;
  }
}
