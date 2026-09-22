/**
 * Retry classification for the outcomes phase 1 of spec 116 made explicit.
 *
 * Executors now reject a signal kill, a turn-limit result, and a turn that
 * ended without its terminal event, instead of resolving them as successes.
 * Each of those messages used to classify as `unknown`, so retryExecute re-ran
 * the whole agent turn from scratch up to three times — including after an
 * OOM kill, after a Stop, and after the turn limit, where a re-run can only
 * burn the same budget again. The messages are built with the real builders so
 * a wording change cannot silently break the classification.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  classifyError,
  retryExecute,
  TRANSIENT_ERROR_CATEGORIES,
} from '@/infrastructure/services/agents/feature-agent/nodes/node-helpers.js';
import {
  agentIdleTimeoutMessage,
  agentTimeoutMessage,
  missingTerminalEventMessage,
  signalTerminationMessage,
} from '@/infrastructure/services/agents/common/executors/process-stream.js';
import { describeResultEventError } from '@/infrastructure/services/agents/common/executors/result-event-outcome.js';
import { StreamingExecutorProxy } from '@/infrastructure/services/agents/streaming/streaming-executor-proxy.js';
import { EventChannel } from '@/infrastructure/services/agents/streaming/event-channel.js';
import type {
  AgentExecutionResult,
  AgentExecutionStreamEvent,
  IAgentExecutor,
} from '@/application/ports/output/agents/agent-executor.interface.js';
import type { AgentType } from '@/domain/generated/output.js';

const MAX_TURNS_MESSAGE = describeResultEventError(
  'Claude Code',
  { subtype: 'error_max_turns' },
  ''
);

describe('classifyError — outcomes executors now reject', () => {
  describe('never retried', () => {
    it.each([
      ['a SIGKILL (OOM killer, container stop)', signalTerminationMessage('SIGKILL', '')],
      ['a SIGTERM (a Stop)', signalTerminationMessage('SIGTERM', '')],
      [
        'a signal kill whose stderr tail mentions a recovered API error',
        signalTerminationMessage('SIGKILL', 'API Error: 529 overloaded — retrying'),
      ],
      ['a turn-limit result', MAX_TURNS_MESSAGE],
      [
        'a turn-limit result whose detail carries an API error',
        describeResultEventError(
          'Claude Code',
          { subtype: 'error_max_turns' },
          '',
          'API Error: 429'
        ),
      ],
      [
        'any other failing result event',
        describeResultEventError('Cursor', { subtype: 'error_during_execution' }, 'tool crashed'),
      ],
      ['an idle timeout', agentIdleTimeoutMessage(900_000)],
      ['a total timeout', agentTimeoutMessage(1_800_000)],
      ['an AI SDK timeout (provider prefix)', `OpenRouter: ${agentTimeoutMessage(300_000)}`],
      ['an API 401', 'API Error: 401 {"type":"error","error":{"type":"authentication_error"}}'],
      ['an API 403', 'Process exited with code 1: API Error: 403 forbidden'],
      ['the Claude login prompt', 'Invalid API key · Please run /login'],
      [
        'an AI SDK auth failure',
        'OpenRouter: Authentication failed (HTTP 401). Check your API key in settings.',
      ],
    ])('%s', (_label, message) => {
      expect(classifyError(message)).toBe('non-retryable');
    });
  });

  describe('retried as transient', () => {
    it('a failing result event whose text is a transient API error', () => {
      const message = describeResultEventError(
        'Claude Code',
        { subtype: 'error_during_execution' },
        'API Error: 529 {"type":"overloaded_error"}'
      );
      expect(classifyError(message)).toBe('retryable-api');
    });

    it.each([
      ['an AI SDK 429', 'OpenRouter: Rate limit exceeded (HTTP 429). Retry after 3s.'],
      [
        'an AI SDK 5xx',
        'OpenRouter: Server error (HTTP 503). The provider may be experiencing issues.',
      ],
    ])('%s', (_label, message) => {
      expect(classifyError(message)).toBe('retryable-api');
    });

    it('an AI SDK connection failure', () => {
      expect(classifyError('OpenRouter: Connection failed. Check your internet connection.')).toBe(
        'retryable-network'
      );
    });
  });

  describe('retried once — a cut stream', () => {
    it.each([
      [
        'Claude exit 0 without a result event',
        missingTerminalEventMessage('Claude Code', 'result'),
      ],
      [
        'Codex exit 0 without turn.completed',
        missingTerminalEventMessage('Codex CLI', 'turn.completed'),
      ],
    ])('%s', (_label, message) => {
      expect(classifyError(message)).toBe('retryable-truncated');
    });

    it('a streamed run that ended without a result event', async () => {
      const channel = new EventChannel<AgentExecutionStreamEvent>();
      const inner = {
        agentType: 'claude-code' as AgentType,
        execute: vi.fn(),
        supportsFeature: () => true,
        async *executeStream() {
          yield { type: 'progress', content: 'partial', timestamp: new Date() } as const;
        },
      } as unknown as IAgentExecutor;
      const consumer = (async () => {
        for await (const _event of channel) {
          /* drain */
        }
      })();

      const error = await new StreamingExecutorProxy(inner, channel)
        .execute('prompt')
        .catch((e: Error) => e);
      channel.close();
      await consumer;

      expect(classifyError((error as Error).message)).toBe('retryable-truncated');
    });
  });
});

describe('retryExecute — per-category budgets', () => {
  const OK: AgentExecutionResult = { result: 'done' };

  function executorFailingWith(...messages: string[]): IAgentExecutor {
    const execute = vi.fn();
    for (const message of messages) execute.mockRejectedValueOnce(new Error(message));
    execute.mockResolvedValue(OK);
    return {
      agentType: 'claude-code' as AgentType,
      execute,
      executeStream: vi.fn(),
      supportsFeature: vi.fn(),
    } as unknown as IAgentExecutor;
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not re-run a turn that hit its turn limit', async () => {
    const executor = executorFailingWith(MAX_TURNS_MESSAGE);

    await expect(retryExecute(executor, 'p', {})).rejects.toThrow(/error_max_turns/);
    expect(executor.execute).toHaveBeenCalledTimes(1);
  });

  it('does not re-run a turn killed by a signal', async () => {
    const executor = executorFailingWith(signalTerminationMessage('SIGKILL', ''));

    await expect(retryExecute(executor, 'p', {})).rejects.toThrow(/SIGKILL/);
    expect(executor.execute).toHaveBeenCalledTimes(1);
  });

  it('re-runs a cut stream once, and succeeds when the re-run completes', async () => {
    const executor = executorFailingWith(missingTerminalEventMessage('Claude Code', 'result'));

    const pending = retryExecute(executor, 'p', {}, { baseDelayMs: 10 });
    await vi.runAllTimersAsync();

    expect(await pending).toEqual(OK);
    expect(executor.execute).toHaveBeenCalledTimes(2);
  });

  it('re-runs a cut stream only once, even with budget left', async () => {
    const cut = missingTerminalEventMessage('Claude Code', 'result');
    const executor = executorFailingWith(cut, cut, cut);

    const pending = retryExecute(executor, 'p', {}, { baseDelayMs: 10, maxAttempts: 3 });
    const assertion = expect(pending).rejects.toThrow(/cut short/);
    await vi.runAllTimersAsync();
    await assertion;

    expect(executor.execute).toHaveBeenCalledTimes(2);
  });

  it('retries only transient errors when restricted to them', async () => {
    const transient = executorFailingWith('API Error: 529 overloaded');
    const pending = retryExecute(
      transient,
      'p',
      {},
      {
        baseDelayMs: 10,
        retryOn: TRANSIENT_ERROR_CATEGORIES,
      }
    );
    await vi.runAllTimersAsync();
    expect(await pending).toEqual(OK);
    expect(transient.execute).toHaveBeenCalledTimes(2);

    for (const message of [
      'Something completely unexpected happened',
      missingTerminalEventMessage('Claude Code', 'result'),
    ]) {
      const other = executorFailingWith(message);
      await expect(
        retryExecute(other, 'p', {}, { baseDelayMs: 10, retryOn: TRANSIENT_ERROR_CATEGORIES })
      ).rejects.toThrow(message);
      expect(other.execute).toHaveBeenCalledTimes(1);
    }
  });
});
