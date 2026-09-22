/**
 * Cursor agent transcript folding.
 *
 * Cursor's JSONL differs from Claude Code's: `role` sits at the top level of
 * each entry rather than under `message.role`, and there is no `cwd` field
 * (the project path comes from the directory being scanned). Serves both the
 * incremental list scan and the detail read; see jsonl-transcript-scanner.ts.
 */

import type { AgentSessionMessage } from '../../../../domain/generated/output.js';
import { storedTimestamp, type TranscriptAccumulator } from './jsonl-transcript-scanner.js';

const TEXT_BLOCK = 'text';

/** A parsed line from a Cursor transcript. */
interface CursorEntry {
  role?: string;
  message?: { content?: unknown };
  timestamp?: unknown;
}

interface RawMessage {
  uuid: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string | null;
}

/** Cursor content may be a plain string or an array of typed blocks. */
export function extractCursorText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === 'object' && block !== null) {
      const record = block as Record<string, unknown>;
      if (record.type === TEXT_BLOCK && typeof record.text === 'string') parts.push(record.text);
    }
  }
  return parts.join('\n');
}

export class CursorTranscriptAccumulator
  implements TranscriptAccumulator<CursorTranscriptAccumulator>
{
  preview: string | undefined;
  messageCount = 0;
  /** `null` = an entry without a timestamp; `undefined` = none seen yet. */
  firstTimestamp: string | null | undefined;
  lastTimestamp: string | null | undefined;
  readonly messages: RawMessage[] = [];

  /**
   * @param transcriptId - Used to synthesise message ids (Cursor rows have none).
   * @param withDetails - Keep every message (detail view), not just the summary.
   */
  constructor(
    private readonly transcriptId: string,
    private readonly withDetails: boolean
  ) {}

  add(raw: unknown): void {
    if (typeof raw !== 'object' || raw === null) return;
    const entry = raw as CursorEntry;
    // Cursor puts role at the top level, not under message.role.
    if (entry.role !== 'user' && entry.role !== 'assistant') return;

    this.messageCount++;
    const content = extractCursorText(entry.message?.content);
    const timestamp = storedTimestamp(entry.timestamp);
    if (this.firstTimestamp === undefined) this.firstTimestamp = timestamp;
    this.lastTimestamp = timestamp;

    if (entry.role === 'user' && this.preview === undefined && content !== '') {
      this.preview = content;
    }
    if (this.withDetails) {
      this.messages.push({
        uuid: `${this.transcriptId}-${this.messageCount}`,
        role: entry.role,
        content,
        timestamp,
      });
    }
  }

  clone(): CursorTranscriptAccumulator {
    const copy = new CursorTranscriptAccumulator(this.transcriptId, this.withDetails);
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
}
