/**
 * Codex CLI Session Repository
 *
 * Infrastructure implementation of IAgentSessionRepository for OpenAI Codex CLI.
 * Reads JSONL session rollout files from `$CODEX_HOME/sessions/` (or `~/.codex/sessions/`
 * when CODEX_HOME is not set) and the session index from `$CODEX_HOME/session_index.jsonl`.
 *
 * Directory structure:
 *   $CODEX_HOME/session_index.jsonl          — one JSON object per line with {id, thread_name, updated_at}
 *   $CODEX_HOME/sessions/YYYY/MM/DD/rollout-<timestamp>-<session-id>.jsonl
 *
 * Rollout file events:
 *   - session_meta: session metadata (id, cwd, cli_version, model_provider)
 *   - event_msg:    lifecycle events (task_started, etc.)
 *   - response_item: messages (role: user/assistant/developer), function_call, function_call_output
 *   - turn_context:  per-turn context (cwd, model, sandbox_policy)
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
import type {
  IAgentSessionRepository,
  ListSessionsOptions,
  GetSessionOptions,
} from '../../../../application/ports/output/agents/agent-session-repository.interface.js';

interface SessionIndexEntry {
  id: string;
  thread_name?: string;
  updated_at?: string;
}

interface SessionFileInfo {
  id: string;
  filePath: string;
  mtime: Date;
  threadName?: string;
}

/** Parsed response_item payload from a Codex rollout file */
interface ResponseItemPayload {
  type: string;
  role?: string;
  name?: string;
  content?: ContentBlock[] | null;
  arguments?: string;
  output?: string;
  call_id?: string;
  phase?: string;
}

interface ContentBlock {
  type: string;
  text?: string;
}

/** Parsed session_meta payload */
interface SessionMetaPayload {
  id: string;
  timestamp?: string;
  cwd?: string;
  cli_version?: string;
  model_provider?: string;
  source?: string;
}

@injectable()
export class CodexCliSessionRepository implements IAgentSessionRepository {
  constructor(private readonly basePath: string = CodexCliSessionRepository.resolveCodexHome()) {}

  /**
   * Resolve the Codex home directory.
   * Uses CODEX_HOME env var if set, otherwise defaults to ~/.codex
   */
  static resolveCodexHome(): string {
    return process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex');
  }

  isSupported(): boolean {
    return true;
  }

  async list(options?: ListSessionsOptions): Promise<AgentSession[]> {
    const limit = options?.limit ?? 20;

    // First try the session index for fast listing
    const indexEntries = await this.readSessionIndex();

    if (indexEntries.length > 0) {
      // Deduplicate: keep the latest entry per session ID
      const latestById = new Map<string, SessionIndexEntry>();
      for (const entry of indexEntries) {
        latestById.set(entry.id, entry);
      }

      // Sort by updated_at descending
      const sorted = [...latestById.values()].sort((a, b) => {
        const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return bTime - aTime;
      });

      const toReturn = limit > 0 ? sorted.slice(0, limit) : sorted;

      // Build lightweight sessions from index (no need to parse full rollout files)
      return toReturn.map((entry) => this.indexEntryToSession(entry));
    }

    // Fallback: scan rollout files directly
    const fileInfos = await this.collectSessionFiles();
    fileInfos.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    const toParse = limit > 0 ? fileInfos.slice(0, limit) : fileInfos;

    const parseResults = await Promise.allSettled(
      toParse.map((fi) => this.parseRolloutFile(fi, { includeMessages: false }))
    );

    const sessions: AgentSession[] = [];
    for (const result of parseResults) {
      if (result.status === 'fulfilled' && result.value !== null) {
        sessions.push(result.value);
      }
    }

    return sessions;
  }

  async findById(id: string, options?: GetSessionOptions): Promise<AgentSession | null> {
    const messageLimit = options?.messageLimit ?? 20;

    const match = await this.findSessionFile(id);
    if (match === null) return null;

    try {
      const stat = await fs.stat(match.filePath);
      const fileInfo: SessionFileInfo = {
        id: match.resolvedId,
        filePath: match.filePath,
        mtime: stat.mtime,
      };
      return await this.parseRolloutFile(fileInfo, { includeMessages: true, messageLimit });
    } catch {
      return null;
    }
  }

  /** Read and parse the session_index.jsonl file */
  private async readSessionIndex(): Promise<SessionIndexEntry[]> {
    const indexPath = path.join(this.basePath, 'session_index.jsonl');
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const entries: SessionIndexEntry[] = [];
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          entries.push(JSON.parse(trimmed) as SessionIndexEntry);
        } catch {
          // Skip malformed lines
        }
      }
      return entries;
    } catch {
      return [];
    }
  }

  /** Convert a session index entry to a lightweight AgentSession */
  private indexEntryToSession(entry: SessionIndexEntry): AgentSession {
    const updatedAt = entry.updated_at ? new Date(entry.updated_at) : new Date();
    return {
      id: entry.id,
      agentType: 'codex-cli' as AgentType,
      projectPath: '',
      messageCount: 0,
      createdAt: updatedAt,
      updatedAt,
      preview: entry.thread_name,
    };
  }

  /**
   * Recursively collect all rollout .jsonl files from the sessions/ directory.
   * Structure: sessions/YYYY/MM/DD/rollout-<timestamp>-<id>.jsonl
   */
  private async collectSessionFiles(): Promise<SessionFileInfo[]> {
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
              const sessionId = this.extractSessionIdFromFilename(entry.name);
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
  private extractSessionIdFromFilename(filename: string): string | null {
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
  private async findSessionFile(
    id: string
  ): Promise<{ filePath: string; resolvedId: string } | null> {
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

  /**
   * Parse a Codex CLI rollout JSONL file into an AgentSession.
   */
  private async parseRolloutFile(
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

    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      const type = entry.type as string;
      const timestamp = entry.timestamp ? new Date(entry.timestamp) : fileInfo.mtime;

      if (type === 'session_meta') {
        const payload = entry.payload as SessionMetaPayload;
        if (payload?.cwd) cwd = payload.cwd;
        continue;
      }

      if (type === 'turn_context') {
        // Use turn context cwd as fallback
        if (!cwd && entry.payload?.cwd) cwd = entry.payload.cwd;
        continue;
      }

      if (type === 'response_item') {
        const payload = entry.payload as ResponseItemPayload;
        if (!payload) continue;

        // Only count user and assistant messages (skip developer/system)
        if (
          payload.type === 'message' &&
          (payload.role === 'user' || payload.role === 'assistant')
        ) {
          messageCount++;

          firstMessageAt ??= timestamp;
          lastMessageAt = timestamp;

          // Extract preview from first user message
          if (payload.role === 'user' && preview === undefined) {
            preview = this.extractTextFromContent(payload.content);
          }

          if (options.includeMessages) {
            messages.push({
              uuid: entry.payload?.call_id ?? `${fileInfo.id}-${messageCount}`,
              role: payload.role as 'user' | 'assistant',
              content: this.extractTextFromContent(payload.content),
              timestamp,
            });
          }
        }

        // Count function calls as part of conversation but don't add as messages
        if (payload.type === 'function_call') {
          messageCount++;
          lastMessageAt = timestamp;

          if (options.includeMessages) {
            const toolName = payload.name ?? 'unknown_tool';
            messages.push({
              uuid: payload.call_id ?? `${fileInfo.id}-${messageCount}`,
              role: 'assistant',
              content: `[tool: ${toolName}] ${payload.arguments ?? ''}`,
              timestamp,
            });
          }
        }

        if (payload.type === 'function_call_output') {
          lastMessageAt = timestamp;

          if (options.includeMessages) {
            const output = payload.output ?? '';
            const truncated = output.length > 500 ? `${output.slice(0, 497)}...` : output;
            messages.push({
              uuid: payload.call_id ?? `${fileInfo.id}-result-${messageCount}`,
              role: 'assistant',
              content: `[tool-result] ${truncated}`,
              timestamp,
            });
          }
        }
      }
    }

    if (cwd === undefined) {
      // Can't determine project path — too sparse
      return null;
    }

    let messagesToReturn = messages;
    if (options.includeMessages && options.messageLimit !== undefined && options.messageLimit > 0) {
      messagesToReturn = messages.slice(-options.messageLimit);
    }

    const session: AgentSession = {
      id: fileInfo.id,
      agentType: 'codex-cli' as AgentType,
      projectPath: this.abbreviatePath(cwd),
      // Absolute transcript path — see AgentSession.filePath.
      filePath: fileInfo.filePath,
      messageCount,
      createdAt: firstMessageAt ?? fileInfo.mtime,
      updatedAt: lastMessageAt ?? fileInfo.mtime,
    };

    if (preview !== undefined) session.preview = preview;
    if (firstMessageAt !== undefined) session.firstMessageAt = firstMessageAt;
    if (lastMessageAt !== undefined) session.lastMessageAt = lastMessageAt;
    if (options.includeMessages) session.messages = messagesToReturn;

    return session;
  }

  /** Extract text from Codex content blocks */
  private extractTextFromContent(content: ContentBlock[] | null | undefined): string {
    if (!content || !Array.isArray(content)) return '';
    const parts: string[] = [];
    for (const block of content) {
      if ((block.type === 'input_text' || block.type === 'output_text') && block.text) {
        parts.push(block.text);
      }
    }
    return parts.join('\n');
  }

  /** Replace home directory prefix with ~ */
  private abbreviatePath(filePath: string): string {
    const home = os.homedir();
    if (filePath === home) return '~';
    if (filePath.startsWith(`${home}${path.sep}`)) {
      return `~${filePath.slice(home.length)}`;
    }
    return filePath;
  }
}
