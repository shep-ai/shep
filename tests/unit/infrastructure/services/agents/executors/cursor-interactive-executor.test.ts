/**
 * CursorInteractiveExecutor — the Cursor profile over the ACP executor.
 *
 * Runs against the in-process fake ACP agent, so the launch command, model
 * mapping and `cursor/ask_question` round trip go over the real wire format.
 *
 * TDD Phase: RED-GREEN
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { RequestError } from '@agentclientprotocol/sdk';

// IS_WINDOWS re-evaluates per test when process.platform is overridden.
vi.mock('@/infrastructure/platform.js', () => ({
  get IS_WINDOWS() {
    return process.platform === 'win32';
  },
}));

import { CursorInteractiveExecutor } from '@/infrastructure/services/agents/common/executors/cursor-interactive-executor.service.js';
import type {
  InteractiveAgentEvent,
  InteractiveAgentOptions,
  InteractiveAgentSessionHandle,
} from '@/application/ports/output/agents/interactive-agent-executor.interface.js';
import type { SpawnFunction } from '@/infrastructure/services/agents/common/types.js';
import {
  fakeAcpSpawn,
  FakeChildProcess,
  selectedOption,
  type FakeAcpAgentBehaviour,
} from '@tests/helpers/fake-acp-agent.js';

const CWD = '/work/app';
const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

const askPayload = {
  toolCallId: 'ask-1',
  title: 'Stack',
  questions: [
    {
      id: 'q1',
      prompt: 'Which framework?',
      options: [
        { id: 'next', label: 'Next.js' },
        { id: 'vite', label: 'Vite' },
      ],
      allowMultiple: false,
    },
  ],
};

/** A fake Cursor that asks one question and echoes the reply as its answer. */
const askingAgent: FakeAcpAgentBehaviour = {
  onPrompt: async ({ client, update }) => {
    const reply = await client.request('cursor/ask_question', askPayload);
    await update({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: JSON.stringify(reply) },
    });
    return { stopReason: 'end_turn' };
  },
};

async function runTurn(handle: InteractiveAgentSessionHandle, message: string) {
  await handle.send(message);
  const events: InteractiveAgentEvent[] = [];
  for await (const event of handle.stream()) events.push(event);
  return events;
}

/** The ask_question reply the fake agent echoed back. */
function echoedReply(events: InteractiveAgentEvent[]): unknown {
  const text = events
    .filter((e) => e.type === 'delta')
    .map((e) => e.content)
    .join('');
  return JSON.parse(text);
}

async function withSession(
  behaviour: FakeAcpAgentBehaviour,
  options: Omit<InteractiveAgentOptions, 'cwd'>,
  body: (handle: InteractiveAgentSessionHandle) => Promise<void>
) {
  const { spawn } = fakeAcpSpawn(behaviour);
  const handle = await new CursorInteractiveExecutor(spawn).createSession({ cwd: CWD, ...options });
  try {
    await body(handle);
  } finally {
    await handle.close();
  }
}

describe('CursorInteractiveExecutor', () => {
  afterEach(() => setPlatform(originalPlatform));

  it('starts `cursor-agent acp` directly on POSIX', async () => {
    setPlatform('linux');
    const { spawn } = fakeAcpSpawn();
    const handle = await new CursorInteractiveExecutor(spawn).createSession({ cwd: CWD });

    expect(spawn.mock.calls[0].slice(0, 2)).toEqual(['cursor-agent', ['acp']]);
    await handle.close();
  });

  it('starts it through cmd.exe on Windows, where cursor-agent is a .cmd shim', async () => {
    setPlatform('win32');
    const { spawn } = fakeAcpSpawn();
    const handle = await new CursorInteractiveExecutor(spawn).createSession({ cwd: CWD });

    expect(spawn.mock.calls[0].slice(0, 2)).toEqual([
      'cmd.exe',
      ['/d', '/c', 'cursor-agent', 'acp'],
    ]);
    setPlatform(originalPlatform);
    await handle.close();
  });

  it('selects the Cursor id of a Shep model', async () => {
    const { spawn, records } = fakeAcpSpawn({
      configOptions: [
        {
          id: 'model',
          name: 'Model',
          category: 'model',
          type: 'select',
          currentValue: 'auto',
          options: [
            { value: 'auto', name: 'Auto' },
            { value: 'claude-opus-4-8-high', name: 'Opus 4.8' },
          ],
        },
      ],
    });
    const handle = await new CursorInteractiveExecutor(spawn).createSession({
      cwd: CWD,
      model: 'claude-opus-4-8',
    });

    expect(records[0].configSets).toEqual([{ configId: 'model', value: 'claude-opus-4-8-high' }]);
    await handle.close();
  });

  it('asks the user through onUserQuestion and answers Cursor with option ids', async () => {
    const onUserQuestion = vi.fn().mockResolvedValue({ 'Which framework?': 'Vite' });

    await withSession(askingAgent, { onUserQuestion }, async (handle) => {
      const events = await runTurn(handle, 'build it');

      expect(onUserQuestion).toHaveBeenCalledWith({
        toolCallId: 'ask-1',
        questions: [
          {
            question: 'Which framework?',
            header: 'Stack',
            options: [
              { label: 'Next.js', description: '' },
              { label: 'Vite', description: '' },
            ],
            multiSelect: false,
          },
        ],
      });
      expect(echoedReply(events)).toEqual({
        outcome: {
          outcome: 'answered',
          answers: [{ questionId: 'q1', selectedOptionIds: ['vite'] }],
        },
      });
    });
  });

  it('routes the question through the agent-question bridge when it answers', async () => {
    const onUserQuestion = vi.fn();
    const agentQuestionBridge = {
      ask: vi.fn().mockResolvedValue({ 'Which framework?': 'Next.js' }),
    };

    await withSession(askingAgent, { onUserQuestion, agentQuestionBridge }, async (handle) => {
      const events = await runTurn(handle, 'build it');

      expect(agentQuestionBridge.ask).toHaveBeenCalledWith({
        toolCallId: 'ask-1',
        questions: expect.any(Array),
      });
      expect(onUserQuestion).not.toHaveBeenCalled();
      expect(echoedReply(events)).toMatchObject({ outcome: { outcome: 'answered' } });
    });
  });

  it('falls back to onUserQuestion when the bridge is off', async () => {
    const onUserQuestion = vi.fn().mockResolvedValue({ 'Which framework?': 'Vite' });
    const agentQuestionBridge = { ask: vi.fn().mockResolvedValue(null) };

    await withSession(askingAgent, { onUserQuestion, agentQuestionBridge }, async (handle) => {
      await runTurn(handle, 'build it');
      expect(onUserQuestion).toHaveBeenCalledOnce();
    });
  });

  it('cancels the question when nobody can answer it, or the answer path fails', async () => {
    await withSession(askingAgent, {}, async (handle) => {
      expect(echoedReply(await runTurn(handle, 'x'))).toEqual({
        outcome: { outcome: 'cancelled' },
      });
    });

    const onUserQuestion = vi.fn().mockRejectedValue(new Error('UI went away'));
    await withSession(askingAgent, { onUserQuestion }, async (handle) => {
      expect(echoedReply(await runTurn(handle, 'x'))).toEqual({
        outcome: { outcome: 'cancelled' },
      });
    });
  });

  it('never answers a question for the user through a permission request', async () => {
    // Cursor falls back to one session/request_permission per question when
    // cursor/ask_question fails; approving it would pick the first answer.
    let picked: string | null = null;
    const { spawn } = fakeAcpSpawn({
      onPrompt: async ({ client, sessionId }) => {
        const response = await client.request('session/request_permission', {
          sessionId,
          toolCall: { toolCallId: 'ask-1_q0', title: 'Which framework?', kind: 'other' },
          options: [
            { optionId: 'next', name: 'Next.js', kind: 'allow_once' },
            { optionId: 'vite', name: 'Vite', kind: 'allow_once' },
            { optionId: '__ask_question_skip__', name: 'Skip', kind: 'reject_once' },
          ],
        });
        picked = selectedOption(response);
        return { stopReason: 'end_turn' };
      },
    });
    const handle = await new CursorInteractiveExecutor(spawn).createSession({ cwd: CWD });

    await runTurn(handle, 'build it');

    expect(picked).toBe('__ask_question_skip__');
    await handle.close();
  });

  it('tells a logged-out user how to log in', async () => {
    const { spawn } = fakeAcpSpawn({ authRequired: true });

    await expect(new CursorInteractiveExecutor(spawn).createSession({ cwd: CWD })).rejects.toThrow(
      /cursor-agent login/
    );
  });

  it('reports a missing cursor-agent with the install hint', async () => {
    const { spawn, processes } = fakeAcpSpawn();
    const pending = new CursorInteractiveExecutor(spawn).createSession({ cwd: CWD });
    processes[0].emit(
      'error',
      Object.assign(new Error('spawn cursor-agent ENOENT'), { code: 'ENOENT' })
    );

    await expect(pending).rejects.toThrow(/Cursor agent CLI not found/);
  });

  it('keeps the reason the agent gives when it answers the handshake with an error', async () => {
    // Verified against cursor-agent 2026.09.26 with an unusable API key.
    const { spawn } = fakeAcpSpawn({
      newSessionError: RequestError.internalError({
        message: 'Failed to initialize session services',
      }),
    });
    const pending = new CursorInteractiveExecutor(spawn).createSession({ cwd: CWD });

    await expect(pending).rejects.toThrow(
      'Cursor could not start a chat session: Internal error: Failed to initialize session services'
    );
    // A live agent that answered is not an outdated CLI.
    await expect(pending).rejects.not.toThrow(/cursor-agent update/);
  });

  it('suggests updating a CLI that exits before the handshake (no acp command)', async () => {
    // An old CLI never speaks ACP: it prints an error and exits.
    const proc = new FakeChildProcess();
    const spawn = (() => proc) as unknown as SpawnFunction;
    const pending = new CursorInteractiveExecutor(spawn).createSession({ cwd: CWD });
    proc.stderr.write("error: unknown command 'acp'\n");
    proc.exit(1);

    await expect(pending).rejects.toThrow(/unknown command 'acp'.*cursor-agent update/s);
  });
});
