/**
 * Agent Stream Consumer
 *
 * Single source of truth for the SDK-stream event-loop switch shared
 * between `InteractiveSessionService.completeBootAsync` and
 * `InteractiveSessionService.executeAndPersistTurn`. Before this
 * collaborator existed, the two call sites each inlined ~140 lines of
 * near-identical switch code — this class dedupes them behind a single
 * `consume()` method that branches on `mode` ('boot' | 'turn') only
 * where behavior legitimately differs.
 *
 * ## CRITICAL — Ordering invariant (do NOT violate)
 *
 * Every `persistToolEvent` call inside the switch is `await`-ed. This
 * is NOT stylistic — it is an ordering invariant the frontend depends
 * on. `SessionPersistence` uses a process-wide monotonic clock
 * (`nextMessageDate`) to guarantee strictly-increasing `createdAt`
 * timestamps for consecutive rows even when the SDK emits `tool_use`
 * and `tool_result` in the same millisecond. If the consumer fires a
 * persist call with `void` instead of `await`, two rows can interleave
 * and end up with identical `createdAt` values, which breaks
 * `ORDER BY created_at ASC` in `interactiveMessageRepo.findByFeatureId`
 * and in turn breaks the tool->Output pairing in
 * `StepTracker.classifyMessages` on the frontend.
 *
 * The regression is codified by:
 *
 * - `tests/unit/infrastructure/services/interactive/core/session-persistence.test.ts`
 *   "persistToolEvent timestamps are strictly increasing under a frozen clock"
 * - `tests/unit/infrastructure/services/interactive/runtime/agent-stream.consumer.test.ts`
 *   "awaits every persistToolEvent so back-to-back tool_use + tool_result never overlap"
 *
 * Do not replace `await` with `void` anywhere in this file.
 *
 * ## Mode differences
 *
 * | Event   | boot                                               | turn                                                 |
 * | ------- | -------------------------------------------------- | ---------------------------------------------------- |
 * | (any)   | Calls `watchdog.bump()` before the switch          | No watchdog                                          |
 * | init    | Passes through unchanged                           | Ignored (avoid repeat "Session started" messages)    |
 * | done    | Captures `handle.sessionId` on result, NO usage    | Accumulates usage in the returned result             |
 * | error   | Throws                                             | Logs via `ILogger`, notifies, continues              |
 */

import type { SessionPersistence } from '../core/session-persistence.js';
import type { StreamEventDispatcher } from '../core/stream-event-dispatcher.js';
import type { SessionState } from '../core/session-registry.js';
import type { ILogger } from '../../../../application/ports/output/services/logger.interface.js';
import type {
  InteractiveAgentEvent,
  InteractiveAgentSessionHandle,
} from '../../../../application/ports/output/agents/interactive-agent-executor.interface.js';
import type { BootWatchdog } from '../lifecycle/boot-watchdog.js';

export type StreamConsumeMode = 'boot' | 'turn';

export interface StreamConsumeUsage {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  numTurns: number;
}

export interface StreamConsumeResult {
  /**
   * `'done'` when the stream emitted a `done` event; `'ended-without-done'`
   * when the async iterator finished (or was aborted) without one.
   */
  completed: 'done' | 'ended-without-done';
  /**
   * Usage metadata captured from the `done` (turn mode) or `error` (turn
   * mode, when the SDK still reports cost) event. Always `undefined`
   * in boot mode — boot greetings don't count toward session usage.
   */
  usage?: StreamConsumeUsage;
  /**
   * The agent SDK session id read off the handle when the `done` event
   * fired during boot. The bootstrapper uses this to reconcile the DB
   * row and detect CWD-mismatch resumption failures. Always `undefined`
   * in turn mode.
   */
  agentSessionIdFromHandle?: string;
}

export class AgentStreamConsumer {
  constructor(
    private readonly persistence: SessionPersistence,
    private readonly dispatcher: StreamEventDispatcher,
    private readonly logger: ILogger
  ) {}

  async consume(
    handle: InteractiveAgentSessionHandle,
    state: SessionState,
    mode: StreamConsumeMode,
    abortController: AbortController,
    watchdog?: BootWatchdog
  ): Promise<StreamConsumeResult> {
    let usage: StreamConsumeUsage | undefined;
    let agentSessionIdFromHandle: string | undefined;

    for await (const event of handle.stream()) {
      if (abortController.signal.aborted) {
        break;
      }

      // In boot mode, reset the idle watchdog on every event so a long-
      // running first turn isn't killed as long as the stream keeps
      // producing output. `bump()` is a no-op in turn mode (no watchdog).
      if (mode === 'boot') {
        watchdog?.bump();
      }

      const done = await this.handleEvent(event, state, mode);
      if (done === 'stream-done') {
        if (mode === 'boot') {
          agentSessionIdFromHandle = handle.sessionId;
        } else if (event.usage) {
          usage = this.readUsage(event);
        }
        return { completed: 'done', usage, agentSessionIdFromHandle };
      }
      if (done === 'error-with-usage' && event.usage) {
        usage = this.readUsage(event);
      }
    }

    return { completed: 'ended-without-done', usage, agentSessionIdFromHandle };
  }

  /**
   * Handle a single event. Returns `'stream-done'` when the caller
   * should exit the loop with `completed: 'done'`; `'error-with-usage'`
   * when a turn-mode error event also carried usage that the caller
   * should harvest on its way to the natural end of the stream.
   */
  private async handleEvent(
    event: InteractiveAgentEvent,
    state: SessionState,
    mode: StreamConsumeMode
  ): Promise<'continue' | 'stream-done' | 'error-with-usage'> {
    switch (event.type) {
      case 'delta':
        if (event.content) {
          state.currentAssistantBuffer += event.content;
          this.dispatcher.notify(state, { delta: event.content, done: false });
        }
        return 'continue';

      case 'thinking':
        if (event.content) {
          await this.persistence.persistToolEvent(state, 'Thinking', event.content);
          this.dispatcher.notify(state, {
            delta: '',
            done: false,
            log: 'Thinking…',
            activity: { kind: 'thinking', label: 'Thinking', detail: event.content },
          });
        }
        return 'continue';

      case 'tool_use':
        if (event.label) {
          const toolLabel = event.label;
          const toolDetail = event.detail;
          await this.persistence.persistToolEvent(state, toolLabel, toolDetail);
          this.dispatcher.notify(state, {
            delta: '',
            done: false,
            log: `Using tool: ${toolLabel}`,
            activity: { kind: 'tool_use', label: toolLabel, detail: toolDetail },
          });
        }
        return 'continue';

      case 'tool_result':
        if (event.label) {
          const resultLabel = event.label;
          const resultDetail = event.detail;
          await this.persistence.persistToolEvent(state, resultLabel, resultDetail);
          this.dispatcher.notify(state, {
            delta: '',
            done: false,
            log: `Completed: ${resultLabel}`,
            activity: { kind: 'tool_result', label: resultLabel, detail: resultDetail },
          });
        }
        return 'continue';

      case 'status':
        if (event.content) {
          this.dispatcher.notify(state, { delta: '', done: false, log: event.content });
        }
        return 'continue';

      case 'done':
        // Flush any trailing prose now so the buffered text is persisted
        // as its own message BEFORE the caller transitions the session
        // to ready/unread. We intentionally do NOT persist `event.content`
        // — that would duplicate the flushed assistant text.
        await this.persistence.flushAssistantBuffer(state);
        state.toolEventsLog = [];
        return 'stream-done';

      case 'error':
        if (mode === 'boot') {
          throw new Error(`Agent error during boot: ${event.content ?? 'unknown'}`);
        }
        this.logger.error(
          `[InteractiveSession] agent error during turn for session ${state.sessionId}`,
          {
            sessionId: state.sessionId,
            featureId: state.featureId,
            error: event.content,
          }
        );
        this.dispatcher.notify(state, {
          delta: '',
          done: true,
          log: `Error: ${event.content ?? 'unknown'}`,
        });
        return 'error-with-usage';

      case 'init':
        // Boot mode may eventually want to forward init once; for now
        // both modes ignore it — the bootstrapper has its own "session
        // started" signal when the handle is first created.
        return 'continue';

      case 'api_retry':
        this.dispatcher.notify(state, {
          delta: '',
          done: false,
          log: event.content ?? 'Retrying API call...',
        });
        return 'continue';

      case 'rate_limit':
        this.dispatcher.notify(state, {
          delta: '',
          done: false,
          log: event.content ?? 'Rate limited',
        });
        return 'continue';

      case 'task_started':
        if (event.content) {
          await this.persistence.persistToolEvent(state, 'Subtask started', event.content);
          this.dispatcher.notify(state, {
            delta: '',
            done: false,
            log: `Subtask: ${event.content}`,
            activity: { kind: 'system', label: 'Subtask started', detail: event.content },
          });
        }
        return 'continue';

      case 'task_progress':
        if (event.content) {
          this.dispatcher.notify(state, {
            delta: '',
            done: false,
            log: `Subtask: ${event.content}`,
          });
        }
        return 'continue';

      case 'task_done':
        if (event.content) {
          const taskStatus = event.detail ?? 'completed';
          await this.persistence.persistToolEvent(state, `Subtask ${taskStatus}`, event.content);
          this.dispatcher.notify(state, {
            delta: '',
            done: false,
            log: `Subtask ${taskStatus}: ${event.content}`,
            activity: {
              kind: 'system',
              label: `Subtask ${taskStatus}`,
              detail: event.content,
            },
          });
        }
        return 'continue';

      case 'user_question':
        // AskUserQuestion is handled by the canUseTool callback
        // (buildOnUserQuestionCallback in the facade). This event
        // should not appear in the stream anymore, but if it does
        // from a different code path, ignore it here.
        return 'continue';

      default:
        return 'continue';
    }
  }

  private readUsage(event: InteractiveAgentEvent): StreamConsumeUsage {
    return {
      costUsd: event.usage?.costUsd ?? 0,
      inputTokens: event.usage?.inputTokens ?? 0,
      outputTokens: event.usage?.outputTokens ?? 0,
      numTurns: event.usage?.numTurns ?? 1,
    };
  }
}
