/**
 * Claude Code Session Repository
 *
 * Infrastructure implementation of IAgentSessionRepository for Claude Code.
 * Reads JSONL session files from ~/.claude/projects/ using a lazy stat-then-parse
 * strategy for performance: stat all files in parallel for mtime-based sorting,
 * then summarise only the top-N files needed for the list view — incrementally,
 * reading just the bytes appended since the previous list (see
 * jsonl-transcript-scanner.ts).
 *
 * File structure:
 *   ~/.claude/projects/<encoded-project-path>/<uuid>.jsonl
 *
 * Subagent sessions stored in subdirectories are excluded by only reading
 * depth-1 .jsonl files from each project directory.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { injectable } from 'tsyringe';
import type { AgentSession, AgentType } from '../../../../domain/generated/output.js';
import { deleteTranscriptPath } from './transcript-deletion.js';
import {
  resolveTimestamp,
  scanTranscript,
  TranscriptSummaryCache,
} from './jsonl-transcript-scanner.js';
import { ClaudeTranscriptAccumulator, type SessionMetadata } from './claude-code-transcript.js';
import {
  ClaudeCodeSessionFileCollector,
  type SessionFileInfo,
} from './claude-code-session-file-collector.js';
import type {
  IAgentSessionRepository,
  ListSessionsOptions,
  GetSessionOptions,
} from '../../../../application/ports/output/agents/agent-session-repository.interface.js';

export type { SessionMetadata } from './claude-code-transcript.js';

@injectable()
export class ClaudeCodeSessionRepository implements IAgentSessionRepository {
  private readonly files: ClaudeCodeSessionFileCollector;
  /** List summaries, advanced by the bytes appended since the previous list. */
  private readonly summaries = new TranscriptSummaryCache(
    () => new ClaudeTranscriptAccumulator(false)
  );

  constructor(private readonly basePath: string = path.join(os.homedir(), '.claude', 'projects')) {
    this.files = new ClaudeCodeSessionFileCollector(basePath);
  }

  isSupported(): boolean {
    return true;
  }

  async list(options?: ListSessionsOptions): Promise<AgentSession[]> {
    const limit = options?.limit ?? 20;
    const filterPath = options?.projectPath;

    // When filtering by path, use the directory naming convention to scan only the
    // matching project directory instead of all 100+ directories. Claude Code encodes
    // project paths as directory names by replacing '/' with '-'.
    const fileInfos = filterPath
      ? await this.files.collectSessionFilesForPath(filterPath, options?.includeWorktrees ?? false)
      : await this.files.collectSessionFiles();
    fileInfos.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // Apply limit before full parsing
    const toParse = limit > 0 ? fileInfos.slice(0, limit) : fileInfos;

    const parseResults = await Promise.allSettled(
      toParse.map((fi) => this.parseSessionFile(fi, { includeMessages: false }))
    );

    const sessions: AgentSession[] = [];
    for (const result of parseResults) {
      if (result.status === 'fulfilled' && result.value !== null) {
        sessions.push(result.value);
      }
    }

    return sessions;
  }

  /**
   * Delete a session transcript from ~/.claude/projects.
   *
   * Resolves the file through the same collector used for reads, so a session
   * id can only ever map to a file this repository already owns.
   */
  async delete(id: string): Promise<boolean> {
    const match = await this.files.findSessionFile(id);
    if (match === null) return false;

    return deleteTranscriptPath(match.filePath, this.basePath);
  }

  async findById(id: string, options?: GetSessionOptions): Promise<AgentSession | null> {
    const messageLimit = options?.messageLimit ?? 20;

    const match = await this.files.findSessionFile(id);
    if (match === null) return null;

    try {
      const stat = await fs.stat(match.filePath);
      const fileInfo: SessionFileInfo = {
        id: match.resolvedId,
        filePath: match.filePath,
        mtime: stat.mtime,
      };
      return await this.parseSessionFile(fileInfo, { includeMessages: true, messageLimit });
    } catch {
      return null;
    }
  }

  /**
   * Read a JSONL session file into an AgentSession.
   *
   * The list view folds only the bytes appended since its previous scan; the
   * detail view reads the whole file for its messages. Both skip malformed
   * lines and tolerate a half-written last line, so a live session stays
   * visible while the agent is still writing it.
   */
  private async parseSessionFile(
    fileInfo: SessionFileInfo,
    options: { includeMessages: boolean; messageLimit?: number }
  ): Promise<AgentSession | null> {
    const transcript = options.includeMessages
      ? await scanTranscript(fileInfo.filePath, new ClaudeTranscriptAccumulator(true))
      : await this.summaries.summarize(fileInfo.filePath);

    if (transcript.cwd === undefined) {
      // Could not determine project path — file is too sparse to be useful
      return null;
    }

    const firstMessageAt = resolveTimestamp(transcript.firstTimestamp, fileInfo.mtime);
    const lastMessageAt = resolveTimestamp(transcript.lastTimestamp, fileInfo.mtime);

    const session: AgentSession & { metadata?: SessionMetadata } = {
      id: fileInfo.id,
      agentType: 'claude-code' as AgentType,
      projectPath: this.abbreviatePath(transcript.cwd),
      // Absolute transcript path, so callers can adopt a session without
      // re-deriving the provider's on-disk path encoding themselves.
      filePath: fileInfo.filePath,
      messageCount: transcript.messageCount,
      createdAt: firstMessageAt ?? fileInfo.mtime,
      updatedAt: lastMessageAt ?? fileInfo.mtime,
    };

    if (transcript.preview !== undefined) session.preview = transcript.preview;
    if (firstMessageAt !== undefined) session.firstMessageAt = firstMessageAt;
    if (lastMessageAt !== undefined) session.lastMessageAt = lastMessageAt;

    if (options.includeMessages) {
      const messages = transcript.messagesAt(fileInfo.mtime);
      const limit = options.messageLimit;
      session.messages = limit !== undefined && limit > 0 ? messages.slice(-limit) : messages;
      session.metadata = transcript.metadata;
    }

    return session;
  }

  /** Replace home directory prefix with ~ in a file path */
  private abbreviatePath(filePath: string): string {
    const home = os.homedir();
    if (filePath === home) return '~';
    if (filePath.startsWith(`${home}${path.sep}`)) {
      return `~${filePath.slice(home.length)}`;
    }
    return filePath;
  }
}
