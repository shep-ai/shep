/**
 * Claude Code Interactive Executor Service
 *
 * Infrastructure implementation of IInteractiveAgentExecutor using the
 * @anthropic-ai/claude-agent-sdk V2 session API. This is the ONLY file
 * that imports from the SDK.
 *
 * ## V2 API Stability Notice
 *
 * This file uses the `unstable_v2_*` session API. The V2 API is chosen over
 * the stable V1 `query()` API because V2 maintains a persistent agent process
 * across turns, providing near-instant turn responses. V1 `query()` spawns a
 * new process per turn with `resume`, adding 5-15s latency — unacceptable
 * for interactive chat.
 *
 * The SDK version is pinned exactly in package.json to prevent surprise
 * breakage. If Anthropic removes the V2 API, migrate to V1 `query()` with
 * `resume: sessionId` — the InteractiveAgentSessionHandle interface is
 * designed to support either backend transparently.
 *
 * ## V2 Limitations (vs V1 query())
 *
 * SDKSessionOptions does NOT support: `cwd`, `maxTurns`, `maxBudgetUsd`,
 * `abortController`, `settingSources`, `persistSession`, `effort`.
 * These must be handled at the service layer:
 * - cwd: Handled via process.chdir() mutex (see withCwd)
 * - abort: Handled via SDKSession.close() which kills the process
 * - maxTurns/maxBudgetUsd: Should be tracked by InteractiveSessionService
 *
 * Design decisions:
 * - The CLAUDECODE env var is stripped to prevent nested-session detection
 *   errors when shep itself is running inside a Claude Code session.
 * - SDK message types are mapped to our own InteractiveAgentEvent to
 *   keep the application layer decoupled from SDK specifics.
 * - AskUserQuestion is intercepted via the SDK's `canUseTool` callback,
 *   which pauses the stream until the user responds. The callback delegates
 *   to the `onUserQuestion` option provided by the session service.
 */

import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
} from '@anthropic-ai/claude-agent-sdk';
import type { SDKSession, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type {
  IInteractiveAgentExecutor,
  InteractiveAgentOptions,
  InteractiveAgentSessionHandle,
  InteractiveAgentEvent,
  ToolResultMessage,
  UserQuestion,
} from '../../../../../application/ports/output/agents/interactive-agent-executor.interface.js';

/** Default model used when options.model is not specified. */
const DEFAULT_MODEL = 'claude-sonnet-4-6';

/**
 * All standard Claude Code tool names to auto-allow without permission prompts.
 *
 * The V2 SDK API hardcodes `allowDangerouslySkipPermissions: false`, so
 * `permissionMode: 'bypassPermissions'` does not work. Instead, V2 provides
 * `allowedTools` to pre-approve tools at the CLI level — no callback needed.
 *
 * AskUserQuestion is intentionally excluded: it is intercepted by the
 * `canUseTool` callback so the session service can pause the stream and
 * collect user answers before resuming.
 */
const AUTO_ALLOWED_TOOLS = [
  'Bash',
  'Read',
  'Write',
  'Edit',
  'Glob',
  'Grep',
  'LS',
  'Agent',
  'WebFetch',
  'WebSearch',
  'NotebookEdit',
  'NotebookRead',
  'TodoWrite',
  'TaskCreate',
  'TaskGet',
  'TaskList',
  'TaskUpdate',
  'TaskOutput',
  'TaskStop',
  'EnterPlanMode',
  'ExitPlanMode',
  'SendMessage',
  'KillShell',
  'LSP',
];

/**
 * Process-level mutex for process.chdir().
 *
 * SDKSessionOptions (V2) does not support a `cwd` parameter, so we
 * temporarily change process.cwd() during session creation. Although
 * session creation itself is synchronous, concurrent API requests can
 * interleave between chdir calls. This mutex serializes all chdir
 * operations to prevent one session from inheriting another's cwd.
 */
let cwdMutexPromise: Promise<void> = Promise.resolve();

export class ClaudeCodeInteractiveExecutor implements IInteractiveAgentExecutor {
  async createSession(options: InteractiveAgentOptions): Promise<InteractiveAgentSessionHandle> {
    const sdkSession = await this.withCwd(options.cwd, () =>
      unstable_v2_createSession(this.buildSdkOptions(options))
    );
    return this.wrapSession(sdkSession);
  }

  async resumeSession(
    sessionId: string,
    options: InteractiveAgentOptions
  ): Promise<InteractiveAgentSessionHandle> {
    const sdkSession = await this.withCwd(options.cwd, () =>
      unstable_v2_resumeSession(sessionId, this.buildSdkOptions(options))
    );
    return this.wrapSession(sdkSession);
  }

  /**
   * Acquire a process-level mutex, change cwd, run the synchronous factory
   * function, restore cwd, and release the mutex.
   *
   * This prevents concurrent session creations from seeing each other's cwd.
   * The mutex is async to serialize across concurrent API request handlers.
   */
  private withCwd<T>(cwd: string, fn: () => T): Promise<T> {
    const prev = cwdMutexPromise;
    let resolve: () => void;
    cwdMutexPromise = new Promise<void>((r) => {
      resolve = r;
    });

    return prev.then(() => {
      const originalCwd = process.cwd();
      try {
        process.chdir(cwd);
        return fn();
      } finally {
        process.chdir(originalCwd);
        resolve!();
      }
    });
  }

  private buildSdkOptions(options: InteractiveAgentOptions) {
    // Strip CLAUDECODE env var to prevent nested-session detection errors.
    const { CLAUDECODE: _, ...cleanEnv } = process.env;

    // Build the canUseTool callback that intercepts AskUserQuestion.
    // When the agent calls AskUserQuestion, this callback:
    // 1. Delegates to onUserQuestion (which notifies the UI and waits for user response)
    // 2. Returns { behavior: 'allow', updatedInput } with the user's answers injected
    // 3. The SDK passes the updated input to AskUserQuestion, which sees pre-filled answers
    //
    // For ALL other tools: auto-allow (same effect as bypassPermissions).
    const canUseTool = options.onUserQuestion
      ? async (toolName: string, input: Record<string, unknown>, opts: { toolUseID: string }) => {
          if (toolName === 'AskUserQuestion') {
            const questions = (input.questions as UserQuestion[]) ?? [];
            const answers = await options.onUserQuestion!({
              toolCallId: opts.toolUseID,
              questions,
            });
            // Inject answers into the tool input so the SDK treats it as already answered
            return {
              behavior: 'allow' as const,
              updatedInput: { ...input, answers },
            };
          }
          // Auto-allow all other tools
          return { behavior: 'allow' as const };
        }
      : undefined;

    // NOTE: The V2 Agent SDK `SDKSessionOptions` type does NOT include
    // a `systemPrompt` field — anything we pass there is silently
    // dropped by the SDK. We learned this the hard way: our earlier
    // attempts to deliver a custom Shep brief via this option never
    // reached the agent. Callers that need to inject a system-level
    // brief must do so via a real artifact the agent reads with its
    // tools (see `CreateApplicationUseCase` which writes
    // `SHEP_BRIEF.md` into the cwd and points the agent to it in the
    // first-turn kickoff message).
    //
    // `options.systemPrompt` is still accepted at the port level for
    // forward compatibility but is intentionally NOT forwarded here —
    // doing so would re-create the "it looks wired but nothing happens"
    // trap for future readers.

    return {
      model: options.model ?? DEFAULT_MODEL,
      // Auto-allow all standard tools at the CLI level. This replaces the V1
      // bypassPermissions approach — V2 hardcodes allowDangerouslySkipPermissions
      // to false, so bypassPermissions silently falls back to default mode.
      allowedTools: AUTO_ALLOWED_TOOLS,
      // When onUserQuestion is provided, use canUseTool to intercept
      // AskUserQuestion while auto-allowing any unlisted tools as a fallback.
      ...(canUseTool ? { canUseTool } : {}),
      env: cleanEnv,
    };
  }

  private wrapSession(sdkSession: SDKSession): InteractiveAgentSessionHandle {
    // SDK session ID is not available until after the first message exchange.
    // Track it via a mutable variable updated by the stream mapper.
    let resolvedSessionId = '';

    return {
      get sessionId() {
        return resolvedSessionId;
      },
      send: (message: string) => sdkSession.send(message),
      sendToolResult: (toolResult: ToolResultMessage) =>
        sdkSession.send({
          type: 'user',
          session_id: sdkSession.sessionId,
          parent_tool_use_id: toolResult.toolCallId,
          tool_use_result: toolResult.result,
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: toolResult.toolCallId,
                content: JSON.stringify(toolResult.result),
              },
            ],
          },
        } as Parameters<SDKSession['send']>[0]),
      stream: () => this.mapStream(sdkSession, (id) => (resolvedSessionId = id)),
      close: async () => sdkSession.close(),
      abort: () => {
        // V2 SDKSession.close() synchronously kills the agent process.
        // This is the only abort mechanism V2 provides.
        sdkSession.close();
      },
    };
  }

  /**
   * Map the SDK message stream to domain events.
   *
   * Tracks whether streaming deltas (`stream_event`) have been emitted for
   * the current turn. When deltas are available, the `assistant` message's
   * text blocks are skipped to prevent double-emission of the same content.
   */
  private async *mapStream(
    sdkSession: SDKSession,
    onSessionId: (id: string) => void
  ): AsyncIterable<InteractiveAgentEvent> {
    let hasStreamedDeltas = false;

    for await (const msg of sdkSession.stream()) {
      // Capture sessionId from messages that carry it
      if ('session_id' in msg && typeof msg.session_id === 'string' && msg.session_id) {
        onSessionId(msg.session_id);
      }

      const events = this.mapSdkMessage(msg, hasStreamedDeltas);
      for (const event of events) {
        yield event;
      }

      // Track whether we've seen streaming deltas for this turn
      if (msg.type === 'stream_event') {
        hasStreamedDeltas = true;
      }

      // Reset delta tracking on turn boundaries
      if (msg.type === 'result') {
        hasStreamedDeltas = false;
      }
    }
  }

  /**
   * Map a single SDK message to zero or more InteractiveAgentEvents.
   *
   * SDK message types we handle:
   * - stream_event (SDKPartialAssistantMessage): streaming content deltas
   * - assistant (SDKAssistantMessage): complete assistant turn with tool_use blocks
   * - result (SDKResultMessage): success or error result with distinct subtypes
   * - system (SDKStatusMessage / SDKSystemMessage): status updates, compaction
   * - tool_use_summary: tool execution summaries
   * - tool_progress: tool execution progress
   * - rate_limit_event: rate limit notifications
   *
   * Other message types are silently ignored (user replays, auth, hooks, etc.)
   */
  private mapSdkMessage(msg: SDKMessage, hasStreamedDeltas: boolean): InteractiveAgentEvent[] {
    const events: InteractiveAgentEvent[] = [];

    switch (msg.type) {
      case 'stream_event': {
        // SDKPartialAssistantMessage — streaming content delta
        const evt = msg.event;
        if (
          evt.type === 'content_block_delta' &&
          'delta' in evt &&
          evt.delta.type === 'text_delta' &&
          'text' in evt.delta
        ) {
          events.push({
            type: 'delta',
            content: evt.delta.text,
          });
        }
        break;
      }

      case 'assistant': {
        // SDKAssistantMessage — complete assistant turn with text + tool_use blocks.
        if ('message' in msg && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              // Skip text blocks if we already emitted streaming deltas for
              // this turn — otherwise the same content appears twice.
              if (!hasStreamedDeltas) {
                events.push({
                  type: 'delta',
                  content: block.text,
                });
              }
            } else if (block.type === 'thinking') {
              // Extended-thinking reasoning — surface as its own event
              // so the session service can persist it inline alongside
              // tool calls for debugging visibility.
              const thinkingText =
                'thinking' in block && typeof block.thinking === 'string' ? block.thinking : '';
              const textText = 'text' in block && typeof block.text === 'string' ? block.text : '';
              const text = thinkingText !== '' ? thinkingText : textText;
              if (text) {
                events.push({
                  type: 'thinking',
                  content: text,
                });
              }
            } else if (block.type === 'tool_use') {
              // AskUserQuestion is handled by canUseTool callback — don't emit as tool_use
              if (block.name === 'AskUserQuestion') {
                // Silently skip — the canUseTool callback already handled this
              } else {
                events.push({
                  type: 'tool_use',
                  label: block.name,
                  detail: JSON.stringify(block.input ?? {}),
                });
              }
            }
          }
        }

        // If the assistant message contains an error, emit it
        if ('error' in msg && msg.error) {
          events.push({
            type: 'error',
            content: String(msg.error),
          });
        }
        break;
      }

      case 'result': {
        // SDKResultMessage — success or error with distinct subtypes
        if (msg.subtype === 'success') {
          events.push({
            type: 'done',
            content: msg.result,
            usage: {
              costUsd: msg.total_cost_usd,
              inputTokens: msg.usage?.input_tokens,
              outputTokens: msg.usage?.output_tokens,
              numTurns: msg.num_turns,
              durationMs: msg.duration_ms,
            },
          });
        } else {
          // Distinguish error subtypes so the UI can show specific messages
          const errorMessages =
            'errors' in msg && Array.isArray(msg.errors) ? msg.errors.join('; ') : '';

          let content: string;
          switch (msg.subtype) {
            case 'error_max_turns':
              content = `Agent reached the maximum number of turns${errorMessages ? `: ${errorMessages}` : ''}`;
              break;
            case 'error_max_budget_usd':
              content = `Agent exceeded the budget limit${errorMessages ? `: ${errorMessages}` : ''}`;
              break;
            case 'error_max_structured_output_retries':
              content = `Agent exceeded structured output retries${errorMessages ? `: ${errorMessages}` : ''}`;
              break;
            case 'error_during_execution':
            default:
              content = errorMessages || 'Agent encountered an error during execution';
              break;
          }

          events.push({
            type: 'error',
            content,
            // Attach usage data even on errors — cost was still incurred
            usage: {
              costUsd: msg.total_cost_usd,
              inputTokens: msg.usage?.input_tokens,
              outputTokens: msg.usage?.output_tokens,
              numTurns: msg.num_turns,
              durationMs: msg.duration_ms,
            },
          });
        }
        break;
      }

      case 'system': {
        if (!('subtype' in msg)) break;
        switch (msg.subtype) {
          case 'init':
            // Session initialized — model, tools, version
            if ('model' in msg) {
              const tools = 'tools' in msg && Array.isArray(msg.tools) ? msg.tools : [];
              const version = 'claude_code_version' in msg ? String(msg.claude_code_version) : '';
              events.push({
                type: 'init',
                label: String(msg.model),
                detail: `${tools.length} tools`,
                content: version ? `v${version}` : undefined,
              });
            }
            break;
          case 'status': {
            // Status updates — including context compaction
            const status = 'status' in msg ? msg.status : null;
            if (status === 'compacting') {
              events.push({
                type: 'status',
                content: 'Compacting context — older conversation will be summarized',
              });
            } else if (status !== null) {
              events.push({
                type: 'status',
                content: String(status),
              });
            }
            break;
          }
          case 'api_retry':
            // API retry — let user know agent is retrying
            if ('attempt' in msg) {
              const attempt = (msg as { attempt: number }).attempt;
              const maxRetries =
                'max_retries' in msg ? (msg as { max_retries: number }).max_retries : '?';
              const delayMs =
                'retry_delay_ms' in msg ? (msg as { retry_delay_ms: number }).retry_delay_ms : 0;
              const delaySec = Math.round(delayMs / 1000);
              events.push({
                type: 'api_retry',
                content: `Retrying API call (attempt ${attempt}/${maxRetries})${delaySec > 0 ? `, waiting ${delaySec}s` : ''}`,
              });
            }
            break;
          case 'task_started':
            if ('description' in msg && 'task_id' in msg) {
              events.push({
                type: 'task_started',
                label: String((msg as { task_id: string }).task_id),
                content: String((msg as { description: string }).description),
              });
            }
            break;
          case 'task_progress':
            if ('description' in msg && 'task_id' in msg) {
              events.push({
                type: 'task_progress',
                label: String((msg as { task_id: string }).task_id),
                content: String((msg as { description: string }).description),
              });
            }
            break;
          case 'task_notification':
            if ('summary' in msg && 'task_id' in msg) {
              const status = 'status' in msg ? String((msg as { status: string }).status) : 'done';
              events.push({
                type: 'task_done',
                label: String((msg as { task_id: string }).task_id),
                content: String((msg as { summary: string }).summary),
                detail: status,
              });
            }
            break;
        }
        break;
      }

      case 'rate_limit_event': {
        if ('rate_limit_info' in msg) {
          const info = msg.rate_limit_info;
          const status = info.status;
          if (status === 'rejected') {
            const resetsAt = info.resetsAt ? new Date(info.resetsAt).toLocaleTimeString() : 'soon';
            events.push({
              type: 'rate_limit',
              content: `Rate limited — resets at ${resetsAt}`,
            });
          } else if (status === 'allowed_warning') {
            const pct = info.utilization ? `${Math.round(info.utilization * 100)}%` : '';
            events.push({
              type: 'rate_limit',
              content: `Rate limit warning${pct ? ` (${pct} used)` : ''}`,
            });
          }
        }
        break;
      }

      case 'tool_use_summary': {
        if ('summary' in msg) {
          events.push({
            type: 'tool_result',
            label: 'Summary',
            detail: typeof msg.summary === 'string' ? msg.summary : String(msg.summary),
          });
        }
        break;
      }

      case 'tool_progress': {
        if ('tool_name' in msg) {
          events.push({
            type: 'status',
            label: msg.tool_name,
            content: `Running ${msg.tool_name}...`,
          });
        }
        break;
      }

      case 'user': {
        // SDKUserMessage — on the agent stream these are replays of
        // tool results (stdout, file contents, grep hits, …) that the
        // SDK loops back into the conversation. Surface them as
        // `tool_result` events so the step card shows the actual
        // output of each tool call right under its bubble.
        if ('message' in msg && msg.message && Array.isArray(msg.message.content)) {
          for (const block of msg.message.content) {
            if (
              block &&
              typeof block === 'object' &&
              'type' in block &&
              block.type === 'tool_result'
            ) {
              const raw = 'content' in block ? block.content : undefined;
              let text = '';
              if (typeof raw === 'string') {
                text = raw;
              } else if (Array.isArray(raw)) {
                // Content blocks array — concatenate any text parts.
                text = raw
                  .map((p) =>
                    p && typeof p === 'object' && 'text' in p && typeof p.text === 'string'
                      ? p.text
                      : ''
                  )
                  .filter(Boolean)
                  .join('\n');
              }
              if (text) {
                events.push({
                  type: 'tool_result',
                  label: 'Output',
                  detail: text,
                });
              }
            }
          }
        }
        break;
      }

      default: {
        // SDKCompactBoundaryMessage — context was compacted.
        // Not in the TS discriminant union, so handle via string check.
        const msgType = (msg as { type: string }).type;
        if (msgType === 'compact_boundary') {
          events.push({
            type: 'status',
            content: 'Context compacted — older conversation has been summarized',
          });
        }
        // Otherwise ignore: user_replay, auth_status,
        // local_command_output, hook_*, files_persisted,
        // elicitation_complete, prompt_suggestion
        break;
      }
    }

    return events;
  }
}
