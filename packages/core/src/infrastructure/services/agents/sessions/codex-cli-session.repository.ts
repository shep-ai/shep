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
import { deleteTranscriptPath } from './transcript-deletion.js';
import type { AgentSession, AgentType } from '../../../../domain/generated/output.js';
import {
  resolveTimestamp,
  scanTranscript,
  TranscriptSummaryCache,
} from './jsonl-transcript-scanner.js';
import { CodexTranscriptAccumulator } from './codex-cli-transcript.js';
import { CodexRolloutFiles, type CodexRolloutFileInfo } from './codex-cli-rollout-files.js';
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

type SessionFileInfo = CodexRolloutFileInfo;

@injectable()
export class CodexCliSessionRepository implements IAgentSessionRepository {
  /**
   * Rollout summaries for the index-less list fallback, advanced by the bytes
   * appended since the previous list (spec 116).
   */
  private readonly summaries = new TranscriptSummaryCache(
    (filePath) =>
      new CodexTranscriptAccumulator(
        CodexRolloutFiles.sessionIdOf(path.basename(filePath)) ?? '',
        false
      )
  );

  private readonly files: CodexRolloutFiles;

  constructor(private readonly basePath: string = CodexCliSessionRepository.resolveCodexHome()) {
    this.files = new CodexRolloutFiles(basePath);
  }

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
    const fileInfos = await this.files.collectSessionFiles();
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

  /**
   * Delete a session transcript from the Codex home directory.
   *
   * Resolves the file through the same lookup used for reads, so a session id
   * can only map to a file this repository already owns.
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
   * Read a Codex CLI rollout JSONL file into an AgentSession.
   *
   * The list fallback folds only the bytes appended since its previous scan;
   * the detail view reads the whole file for its messages. Both skip
   * malformed lines and tolerate a half-written last line.
   */
  private async parseRolloutFile(
    fileInfo: SessionFileInfo,
    options: { includeMessages: boolean; messageLimit?: number }
  ): Promise<AgentSession | null> {
    const transcript = options.includeMessages
      ? await scanTranscript(fileInfo.filePath, new CodexTranscriptAccumulator(fileInfo.id, true))
      : await this.summaries.summarize(fileInfo.filePath);

    if (transcript.cwd === undefined) {
      // Can't determine project path — too sparse
      return null;
    }

    const firstMessageAt = resolveTimestamp(transcript.firstTimestamp, fileInfo.mtime);
    const lastMessageAt = resolveTimestamp(transcript.lastTimestamp, fileInfo.mtime);

    const session: AgentSession = {
      id: fileInfo.id,
      agentType: 'codex-cli' as AgentType,
      projectPath: this.abbreviatePath(transcript.cwd),
      // Absolute transcript path — see AgentSession.filePath.
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
    }

    return session;
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
