/**
 * ACP Update Translator
 *
 * Turns Agent Client Protocol `session/update` payloads into the
 * {@link InteractiveAgentEvent}s the chat runtime already consumes, so an ACP
 * agent needs no special casing downstream of its executor.
 *
 * Two shaping rules the runtime depends on:
 *
 * - Thought chunks are coalesced. `AgentStreamConsumer` persists one chat row
 *   per `thinking` event, and ACP agents stream thoughts a few tokens at a
 *   time, so each run of thought chunks becomes ONE event, emitted when the
 *   next non-thought update arrives or the turn ends ({@link flush}).
 * - Tool results carry the label `Output`, the label the web step tracker
 *   pairs with the preceding tool call (the Claude executor uses the same).
 */

import type {
  ContentBlock,
  SessionUpdate,
  ToolCallContent,
  ToolCallStatus,
} from '@agentclientprotocol/sdk';
import type { InteractiveAgentEvent } from '../../../../../../application/ports/output/agents/interactive-agent-executor.interface.js';

/** Label of a tool's result row — the step tracker pairs it with the call. */
const TOOL_RESULT_LABEL = 'Output';

/** Prefix of a result whose tool call failed. */
const FAILED_TOOL_PREFIX = 'Failed: ';

/** Shown when the agent starts compacting its context (same wording as Claude). */
const COMPACTING_MESSAGE = 'Compacting context — older conversation will be summarized';

/** Tool statuses after which no more output arrives for the call. */
const FINISHED_TOOL_STATUSES: ReadonlySet<ToolCallStatus> = new Set(['completed', 'failed']);

/** Notice severities worth a status line; `info` notices are chatter. */
const REPORTED_NOTICE_SEVERITIES: ReadonlySet<string> = new Set(['warning', 'error']);

/** Compaction status that marks the start of a compaction. */
const COMPACTION_STARTED = 'in_progress';

/** Text of a content block, or '' for blocks that are not text. */
function blockText(block: ContentBlock): string {
  return block.type === 'text' ? block.text : '';
}

/** Readable text of a tool call's content, one line per item. */
function toolContentText(content: readonly ToolCallContent[] | null | undefined): string {
  if (!content) return '';
  return content
    .map((item) => {
      if (item.type === 'content') return blockText(item.content);
      if (item.type === 'diff') return `Edited ${item.path}`;
      return '';
    })
    .filter((line) => line.length > 0)
    .join('\n');
}

/** The first value that is a non-empty string (titles may be sent as ''). */
function firstNonEmpty(...values: (string | null | undefined)[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

/** Serialise a structured payload for a detail field; '' when absent. */
function serialise(value: unknown): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Stateful per-session translator. Create one per ACP session; call
 * {@link translate} for every update and {@link flush} when a turn ends.
 */
export class AcpUpdateTranslator {
  private pendingThought = '';

  /** Events for one `session/update`, in the order the chat should show them. */
  translate(update: SessionUpdate): InteractiveAgentEvent[] {
    if (update.sessionUpdate === 'agent_thought_chunk') {
      this.pendingThought += blockText(update.content);
      return [];
    }
    return [...this.flush(), ...this.translateOutput(update)];
  }

  /** Emit a thought still being accumulated. Idempotent. */
  flush(): InteractiveAgentEvent[] {
    const thought = this.pendingThought;
    this.pendingThought = '';
    return thought ? [{ type: 'thinking', content: thought }] : [];
  }

  private translateOutput(update: SessionUpdate): InteractiveAgentEvent[] {
    switch (update.sessionUpdate) {
      case 'agent_message_chunk': {
        const text = blockText(update.content);
        return text ? [{ type: 'delta', content: text }] : [];
      }
      case 'tool_call': {
        const events: InteractiveAgentEvent[] = [
          {
            type: 'tool_use',
            label: firstNonEmpty(update.title, update.name) ?? update.toolCallId,
            detail: serialise(update.rawInput) || '{}',
          },
        ];
        return [...events, ...this.toolResult(update)];
      }
      case 'tool_call_update':
        return this.toolResult(update);
      case 'notice': {
        if (!REPORTED_NOTICE_SEVERITIES.has(update.severity)) return [];
        const content = update.description
          ? `${update.title}: ${update.description}`
          : update.title;
        return [{ type: 'status', content }];
      }
      case 'compaction_update':
        return update.status === COMPACTION_STARTED
          ? [{ type: 'status', content: COMPACTING_MESSAGE }]
          : [];
      default:
        // user_message_chunk (echo), plan, commands, mode, config, session
        // info and usage updates carry no chat output.
        return [];
    }
  }

  /** A tool_result once the call has finished and produced any output. */
  private toolResult(update: {
    status?: ToolCallStatus | null;
    content?: readonly ToolCallContent[] | null;
    rawOutput?: unknown;
  }): InteractiveAgentEvent[] {
    if (!update.status || !FINISHED_TOOL_STATUSES.has(update.status)) return [];
    const output = toolContentText(update.content) || serialise(update.rawOutput);
    if (!output) return [];
    const detail = update.status === 'failed' ? `${FAILED_TOOL_PREFIX}${output}` : output;
    return [{ type: 'tool_result', label: TOOL_RESULT_LABEL, detail }];
  }
}
