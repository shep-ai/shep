/**
 * Claude Code Session Repository
 *
 * Infrastructure implementation of IAgentSessionRepository for Claude Code.
 * Reads JSONL session files from ~/.claude/projects/ using a lazy stat-then-parse
 * strategy for performance: stat all files in parallel for mtime-based sorting,
 * then fully parse only the top-N files needed for the list view.
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
import type {
  AgentSession,
  AgentSessionMessage,
  AgentType,
} from '../../../../domain/generated/output.js';
import { deleteTranscriptPath } from './transcript-deletion.js';
import {
  ClaudeCodeSessionFileCollector,
  type SessionFileInfo,
} from './claude-code-session-file-collector.js';
import type {
  IAgentSessionRepository,
  ListSessionsOptions,
  GetSessionOptions,
} from '../../../../application/ports/output/agents/agent-session-repository.interface.js';

/**
 * A parsed line entry from a Claude Code JSONL session file.
 */
interface JournalEntry {
  uuid?: string;
  parentUuid?: string;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  isSidechain?: boolean;
  permissionMode?: string;
  userType?: string;
  type: string;
  message?: {
    role?: string;
    content?: unknown;
  };
}

/** Extra metadata extracted from session JSONL that isn't in the domain type */
export interface SessionMetadata {
  cliVersion?: string;
  gitBranch?: string;
  permissionMode?: string;
  userType?: string;
  toolUsage: Record<string, number>;
  userMessageCount: number;
  assistantMessageCount: number;
}

@injectable()
export class ClaudeCodeSessionRepository implements IAgentSessionRepository {
  private readonly files: ClaudeCodeSessionFileCollector;

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
   * Parse a JSONL session file into an AgentSession.
   *
   * Throws on any JSON parse failure so the caller can skip the file.
   */
  private async parseSessionFile(
    fileInfo: SessionFileInfo,
    options: { includeMessages: boolean; messageLimit?: number }
  ): Promise<AgentSession | null> {
    const content = await fs.readFile(fileInfo.filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);

    let cwd: string | undefined;
    let firstMessageAt: Date | undefined;
    let lastMessageAt: Date | undefined;
    let preview: string | undefined;
    let messageCount = 0;
    const messages: AgentSessionMessage[] = [];

    // Extra metadata tracking
    let cliVersion: string | undefined;
    let gitBranch: string | undefined;
    let permissionMode: string | undefined;
    let userType: string | undefined;
    const toolUsage: Record<string, number> = {};
    let userMessageCount = 0;
    let assistantMessageCount = 0;

    for (const line of lines) {
      // JSON.parse throws on invalid JSON — propagates to caller which skips the file
      const entry = JSON.parse(line) as JournalEntry;

      if (!cwd && typeof entry.cwd === 'string') {
        cwd = entry.cwd;
      }
      if (!cliVersion && typeof entry.version === 'string') {
        cliVersion = entry.version;
      }
      if (!gitBranch && typeof entry.gitBranch === 'string') {
        gitBranch = entry.gitBranch;
      }
      if (!permissionMode && typeof entry.permissionMode === 'string') {
        permissionMode = entry.permissionMode;
      }
      if (!userType && typeof entry.userType === 'string') {
        userType = entry.userType;
      }

      if (entry.type === 'user' || entry.type === 'assistant') {
        const message = entry.message;
        const role = message?.role;
        if (role === 'user' || role === 'assistant') {
          messageCount++;
          if (role === 'user') userMessageCount++;
          if (role === 'assistant') assistantMessageCount++;

          const timestamp = entry.timestamp ? new Date(entry.timestamp) : fileInfo.mtime;

          firstMessageAt ??= timestamp;
          lastMessageAt = timestamp;

          if (entry.type === 'user' && preview === undefined) {
            preview = this.extractTextContent(message?.content);
          }

          // Track tool usage from assistant messages
          if (role === 'assistant' && Array.isArray(message?.content)) {
            for (const block of message.content as Record<string, unknown>[]) {
              if (block?.type === 'tool_use' && typeof block.name === 'string') {
                toolUsage[block.name] = (toolUsage[block.name] ?? 0) + 1;
              }
            }
          }

          if (options.includeMessages) {
            messages.push({
              uuid: entry.uuid ?? '',
              role: role as 'user' | 'assistant',
              content: this.extractTextContent(message?.content),
              timestamp,
            });
          }
        }
      }
    }

    if (cwd === undefined) {
      // Could not determine project path — file is too sparse to be useful
      return null;
    }

    let messagesToReturn = messages;
    if (options.includeMessages && options.messageLimit !== undefined && options.messageLimit > 0) {
      messagesToReturn = messages.slice(-options.messageLimit);
    }

    const session: AgentSession & { metadata?: SessionMetadata } = {
      id: fileInfo.id,
      agentType: 'claude-code' as AgentType,
      projectPath: this.abbreviatePath(cwd),
      // Absolute transcript path, so callers can adopt a session without
      // re-deriving the provider's on-disk path encoding themselves.
      filePath: fileInfo.filePath,
      messageCount,
      createdAt: firstMessageAt ?? fileInfo.mtime,
      updatedAt: lastMessageAt ?? fileInfo.mtime,
    };

    if (preview !== undefined) {
      session.preview = preview;
    }
    if (firstMessageAt !== undefined) {
      session.firstMessageAt = firstMessageAt;
    }
    if (lastMessageAt !== undefined) {
      session.lastMessageAt = lastMessageAt;
    }
    if (options.includeMessages) {
      session.messages = messagesToReturn;
      session.metadata = {
        cliVersion,
        gitBranch,
        permissionMode,
        userType,
        toolUsage,
        userMessageCount,
        assistantMessageCount,
      };
    }

    return session;
  }

  /**
   * Extract plain text from message content.
   * - string content: returned as-is
   * - array content: concatenates all text blocks; falls back to tool_use summary
   */
  private extractTextContent(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      // Collect all text blocks
      const textParts: string[] = [];
      const toolNames: string[] = [];

      for (const block of content) {
        if (typeof block !== 'object' || block === null) continue;
        const b = block as Record<string, unknown>;
        if (b.type === 'text' && typeof b.text === 'string') {
          textParts.push(b.text);
        } else if (b.type === 'tool_use' && typeof b.name === 'string') {
          toolNames.push(b.name);
        }
      }

      if (textParts.length > 0) {
        return textParts.join('\n');
      }
      // No text blocks — summarize tool usage
      if (toolNames.length > 0) {
        return `[${toolNames.join(', ')}]`;
      }
    }
    return '';
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
