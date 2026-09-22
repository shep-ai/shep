/**
 * Claude Code transcript folding.
 *
 * Turns the entries of a Claude Code JSONL transcript into the fields an
 * `AgentSession` needs. Kept apart from the repository so the same logic
 * serves both the incremental list scan (summary only) and the detail read
 * (messages + metadata), and so the repository stays within the file limit.
 */

import type { AgentSessionMessage } from '../../../../domain/generated/output.js';
import { storedTimestamp, type TranscriptAccumulator } from './jsonl-transcript-scanner.js';

/** A parsed line entry from a Claude Code JSONL session file. */
interface JournalEntry {
  uuid?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  permissionMode?: string;
  userType?: string;
  type?: string;
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

/** A message whose timestamp may be missing (the file mtime stands in for it). */
interface RawMessage {
  uuid: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string | undefined;
}

type Role = RawMessage['role'];
const ROLES: readonly string[] = ['user', 'assistant'] satisfies Role[];
const USER: Role = 'user';
const TOOL_USE_BLOCK = 'tool_use';
const TEXT_BLOCK = 'text';

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.includes(value);
}

/**
 * Extract plain text from message content.
 * - string content: returned as-is
 * - array content: concatenates all text blocks; falls back to tool_use summary
 */
export function extractClaudeTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  const textParts: string[] = [];
  const toolNames: string[] = [];
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as Record<string, unknown>;
    if (b.type === TEXT_BLOCK && typeof b.text === 'string') {
      textParts.push(b.text);
    } else if (b.type === TOOL_USE_BLOCK && typeof b.name === 'string') {
      toolNames.push(b.name);
    }
  }

  if (textParts.length > 0) return textParts.join('\n');
  // No text blocks — summarize tool usage
  if (toolNames.length > 0) return `[${toolNames.join(', ')}]`;
  return '';
}

/**
 * Folds Claude Code transcript entries. With `withDetails` it also keeps
 * every message and the extra metadata shown by the detail view; the list
 * view leaves it off so a cached summary stays small.
 */
export class ClaudeTranscriptAccumulator
  implements TranscriptAccumulator<ClaudeTranscriptAccumulator>
{
  cwd: string | undefined;
  preview: string | undefined;
  messageCount = 0;
  /** `null` = the first message had no timestamp; `undefined` = no message yet. */
  firstTimestamp: string | null | undefined;
  lastTimestamp: string | null | undefined;
  readonly messages: RawMessage[] = [];
  readonly metadata: SessionMetadata = {
    toolUsage: {},
    userMessageCount: 0,
    assistantMessageCount: 0,
  };

  constructor(private readonly withDetails: boolean) {}

  add(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const entry = raw as JournalEntry;
    this.cwd ??= typeof entry.cwd === 'string' ? entry.cwd : undefined;
    if (this.withDetails) this.collectMetadata(entry);

    if (entry.type !== 'user' && entry.type !== 'assistant') return;
    const role = entry.message?.role;
    if (!isRole(role)) return;

    this.messageCount++;
    const timestamp = storedTimestamp(entry.timestamp);
    if (this.firstTimestamp === undefined) this.firstTimestamp = timestamp;
    this.lastTimestamp = timestamp;

    const content = entry.message?.content;
    if (entry.type === USER && this.preview === undefined) {
      this.preview = extractClaudeTextContent(content);
    }
    if (!this.withDetails) return;

    if (role === USER) this.metadata.userMessageCount++;
    else this.metadata.assistantMessageCount++;
    if (role !== USER && Array.isArray(content)) this.countToolUse(content);

    this.messages.push({
      uuid: entry.uuid ?? '',
      role,
      content: extractClaudeTextContent(content),
      timestamp: timestamp ?? undefined,
    });
  }

  clone(): ClaudeTranscriptAccumulator {
    const copy = new ClaudeTranscriptAccumulator(this.withDetails);
    copy.cwd = this.cwd;
    copy.preview = this.preview;
    copy.messageCount = this.messageCount;
    copy.firstTimestamp = this.firstTimestamp;
    copy.lastTimestamp = this.lastTimestamp;
    copy.messages.push(...this.messages);
    Object.assign(copy.metadata, this.metadata, { toolUsage: { ...this.metadata.toolUsage } });
    return copy;
  }

  /** Messages with a missing timestamp resolved to `fallback` (the file mtime). */
  messagesAt(fallback: Date): AgentSessionMessage[] {
    return this.messages.map((m) => ({
      uuid: m.uuid,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp ? new Date(m.timestamp) : fallback,
    }));
  }

  private collectMetadata(entry: JournalEntry): void {
    const meta = this.metadata;
    if (typeof entry.version === 'string') meta.cliVersion ??= entry.version;
    if (typeof entry.gitBranch === 'string') meta.gitBranch ??= entry.gitBranch;
    if (typeof entry.permissionMode === 'string') meta.permissionMode ??= entry.permissionMode;
    if (typeof entry.userType === 'string') meta.userType ??= entry.userType;
  }

  private countToolUse(blocks: unknown[]): void {
    for (const block of blocks as Record<string, unknown>[]) {
      if (block?.type === TOOL_USE_BLOCK && typeof block.name === 'string') {
        const usage = this.metadata.toolUsage;
        usage[block.name] = (usage[block.name] ?? 0) + 1;
      }
    }
  }
}
