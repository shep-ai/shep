/**
 * Codex CLI rollout folding.
 *
 * Turns the entries of a Codex rollout JSONL file into the fields an
 * `AgentSession` needs, for both the incremental list scan (summary only)
 * and the detail read (messages). See jsonl-transcript-scanner.ts.
 *
 * Rollout file events:
 *   - session_meta:  session metadata (id, cwd, cli_version, model_provider)
 *   - turn_context:  per-turn context (cwd, model, sandbox_policy)
 *   - response_item: messages (role: user/assistant/developer), function_call,
 *                    function_call_output
 */

import type { AgentSessionMessage } from '../../../../domain/generated/output.js';
import { storedTimestamp, type TranscriptAccumulator } from './jsonl-transcript-scanner.js';

const SESSION_META = 'session_meta';
const TURN_CONTEXT = 'turn_context';
const RESPONSE_ITEM = 'response_item';
const MESSAGE_ITEM = 'message';
const FUNCTION_CALL_ITEM = 'function_call';
const FUNCTION_CALL_OUTPUT_ITEM = 'function_call_output';
const TEXT_BLOCK_TYPES: readonly string[] = ['input_text', 'output_text'];
const UNKNOWN_TOOL = 'unknown_tool';
/** Longest tool output kept in a detail-view message. */
const MAX_TOOL_OUTPUT_CHARS = 500;
const TRUNCATION_MARKER = '...';

interface ContentBlock {
  type: string;
  text?: string;
}

/** Parsed response_item payload from a Codex rollout file */
interface ResponseItemPayload {
  type?: string;
  role?: string;
  name?: string;
  content?: ContentBlock[] | null;
  arguments?: string;
  output?: string;
  call_id?: string;
}

interface RolloutEntry {
  type?: string;
  timestamp?: unknown;
  payload?: { cwd?: string } & ResponseItemPayload;
}

interface RawMessage {
  uuid: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string | null;
}

/** Extract text from Codex content blocks */
export function extractCodexText(content: ContentBlock[] | null | undefined): string {
  if (!content || !Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (TEXT_BLOCK_TYPES.includes(block.type) && block.text) parts.push(block.text);
  }
  return parts.join('\n');
}

function truncateToolOutput(output: string): string {
  if (output.length <= MAX_TOOL_OUTPUT_CHARS) return output;
  return `${output.slice(0, MAX_TOOL_OUTPUT_CHARS - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`;
}

export class CodexTranscriptAccumulator
  implements TranscriptAccumulator<CodexTranscriptAccumulator>
{
  cwd: string | undefined;
  preview: string | undefined;
  messageCount = 0;
  /** `null` = an entry without a timestamp; `undefined` = none seen yet. */
  firstTimestamp: string | null | undefined;
  lastTimestamp: string | null | undefined;
  readonly messages: RawMessage[] = [];

  /**
   * @param sessionId - Used to synthesise message ids when a row has no call_id.
   * @param withDetails - Keep every message (detail view), not just the summary.
   */
  constructor(
    private readonly sessionId: string,
    private readonly withDetails: boolean
  ) {}

  add(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const entry = raw as RolloutEntry;
    const payload = entry.payload;
    const timestamp = storedTimestamp(entry.timestamp);

    if (entry.type === SESSION_META) {
      if (payload?.cwd) this.cwd = payload.cwd;
      return;
    }
    if (entry.type === TURN_CONTEXT) {
      // Turn context cwd is only a fallback for a missing session_meta.
      if (!this.cwd && payload?.cwd) this.cwd = payload.cwd;
      return;
    }
    if (entry.type !== RESPONSE_ITEM || !payload) return;

    if (
      payload.type === MESSAGE_ITEM &&
      (payload.role === 'user' || payload.role === 'assistant')
    ) {
      this.messageCount++;
      if (this.firstTimestamp === undefined) this.firstTimestamp = timestamp;
      this.lastTimestamp = timestamp;
      if (payload.role === 'user' && this.preview === undefined) {
        this.preview = extractCodexText(payload.content);
      }
      this.keep(
        payload.call_id ?? `${this.sessionId}-${this.messageCount}`,
        payload.role,
        () => extractCodexText(payload.content),
        timestamp
      );
    }

    // Function calls count as conversation but are rendered as tool lines.
    if (payload.type === FUNCTION_CALL_ITEM) {
      this.messageCount++;
      this.lastTimestamp = timestamp;
      this.keep(
        payload.call_id ?? `${this.sessionId}-${this.messageCount}`,
        'assistant',
        () => `[tool: ${payload.name ?? UNKNOWN_TOOL}] ${payload.arguments ?? ''}`,
        timestamp
      );
    }

    if (payload.type === FUNCTION_CALL_OUTPUT_ITEM) {
      this.lastTimestamp = timestamp;
      this.keep(
        payload.call_id ?? `${this.sessionId}-result-${this.messageCount}`,
        'assistant',
        () => `[tool-result] ${truncateToolOutput(payload.output ?? '')}`,
        timestamp
      );
    }
  }

  clone(): CodexTranscriptAccumulator {
    const copy = new CodexTranscriptAccumulator(this.sessionId, this.withDetails);
    copy.cwd = this.cwd;
    copy.preview = this.preview;
    copy.messageCount = this.messageCount;
    copy.firstTimestamp = this.firstTimestamp;
    copy.lastTimestamp = this.lastTimestamp;
    copy.messages.push(...this.messages);
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

  private keep(
    uuid: string,
    role: RawMessage['role'],
    content: () => string,
    timestamp: string | null
  ): void {
    if (this.withDetails) this.messages.push({ uuid, role, content: content(), timestamp });
  }
}
