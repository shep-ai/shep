/**
 * AcpInteractiveExecutor / AcpInteractiveSession
 *
 * Driven against a real in-process ACP agent (the SDK's `agent()` app) wired
 * to a fake child process, so every assertion goes through the NDJSON wire
 * path the Cursor CLI uses.
 *
 * TDD Phase: RED-GREEN
 */

import { describe, it, expect } from 'vitest';
import type { SessionConfigOption } from '@agentclientprotocol/sdk';
import {
  AcpInteractiveExecutor,
  type AcpAgentProfile,
} from '@/infrastructure/services/agents/common/executors/acp/acp-interactive-executor.js';
import type {
  InteractiveAgentEvent,
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

const profile: AcpAgentProfile = {
  agentName: 'Fake Agent',
  notFoundMessage: 'Fake agent CLI not found. Install it.',
  loginHint: 'Fake agent is not logged in. Run `fake login`.',
  launchCommand: () => ({ command: 'fake-agent', args: ['acp'] }),
  toAgentModel: (model) => `fake-${model}`,
};

const modelOption = (values: string[], current: string): SessionConfigOption => ({
  id: 'model',
  name: 'Model',
  category: 'model',
  type: 'select',
  currentValue: current,
  options: values.map((value) => ({ value, name: value })),
});

function setup(behaviour: FakeAcpAgentBehaviour = {}, handshakeTimeoutMs?: number) {
  const fake = fakeAcpSpawn(behaviour);
  const executor = new AcpInteractiveExecutor(fake.spawn, profile, { handshakeTimeoutMs });
  return { ...fake, executor };
}

/** Send one message and collect the turn's events until the stream ends. */
async function runTurn(
  handle: InteractiveAgentSessionHandle,
  message: string
): Promise<InteractiveAgentEvent[]> {
  await handle.send(message);
  const events: InteractiveAgentEvent[] = [];
  for await (const event of handle.stream()) events.push(event);
  return events;
}

describe('AcpInteractiveExecutor', () => {
  describe('createSession', () => {
    it('launches the agent in the worktree and advertises no fs or terminal capability', async () => {
      const { executor, spawn, records } = setup();
      const handle = await executor.createSession({ cwd: CWD });

      const [command, args, options] = spawn.mock.calls[0] as [string, string[], { cwd: string }];
      expect(command).toBe('fake-agent');
      expect(args).toEqual(['acp']);
      expect(options.cwd).toBe(CWD);
      expect(records[0].initialize[0]).toMatchObject({
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      });
      expect(records[0].newSessions).toEqual([{ cwd: CWD }]);
      expect(handle.sessionId).toMatch(/^fake-session-/);
      await handle.close();
    });

    it('streams a turn as deltas followed by done', async () => {
      const { executor } = setup({
        onPrompt: async ({ update }) => {
          await update({
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'Hel' },
          });
          await update({
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'lo' },
          });
          return {
            stopReason: 'end_turn',
            usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
          };
        },
      });
      const handle = await executor.createSession({ cwd: CWD });

      const events = await runTurn(handle, 'hi');

      expect(events.map((e) => e.type)).toEqual(['delta', 'delta', 'done']);
      expect(
        events
          .filter((e) => e.type === 'delta')
          .map((e) => e.content)
          .join('')
      ).toBe('Hello');
      expect(events[2].usage).toMatchObject({ inputTokens: 12, outputTokens: 3, numTurns: 1 });
      await handle.close();
    });

    it('serves every turn from the same agent process', async () => {
      const { executor, spawn, records } = setup();
      const handle = await executor.createSession({ cwd: CWD });

      await runTurn(handle, 'first');
      await runTurn(handle, 'second');

      expect(spawn.mock.calls).toHaveLength(1);
      expect(records[0].prompts.map((p) => p.text)).toEqual(['first', 'second']);
      await handle.close();
    });

    it('fails with the login hint when the agent is not authenticated', async () => {
      const { executor, processes } = setup({ authRequired: true });

      await expect(executor.createSession({ cwd: CWD })).rejects.toThrow(profile.loginHint);
      expect(processes[0].killed).toBe(true);
    });

    it('fails with the install hint when the binary is missing', async () => {
      const { executor, processes } = setup();
      const pending = executor.createSession({ cwd: CWD });
      const enoent = Object.assign(new Error('spawn fake-agent ENOENT'), { code: 'ENOENT' });
      processes[0].emit('error', enoent);

      await expect(pending).rejects.toThrow(profile.notFoundMessage);
    });

    it('gives up on an agent that never answers initialize', async () => {
      // Nothing serves ACP on this process's stdio, so initialize never returns.
      const proc = new FakeChildProcess();
      const hung = new AcpInteractiveExecutor((() => proc) as unknown as SpawnFunction, profile, {
        handshakeTimeoutMs: 50,
      });

      await expect(hung.createSession({ cwd: CWD })).rejects.toThrow(/did not respond/);
      expect(proc.killed).toBe(true);
    });
  });

  describe('resumeSession', () => {
    const history: FakeAcpAgentBehaviour['loadableSessions'] = {
      'old-session': [
        {
          sessionUpdate: 'user_message_chunk',
          content: { type: 'text', text: 'earlier question' },
        },
        { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'earlier answer' } },
      ],
    };

    it('loads the session and never replays its history into the chat', async () => {
      const { executor, records } = setup({ loadableSessions: history });
      const handle = await executor.resumeSession('old-session', { cwd: CWD });

      const events = await runTurn(handle, 'next');

      expect(records[0].loads).toEqual(['old-session']);
      expect(records[0].newSessions).toEqual([]);
      expect(handle.sessionId).toBe('old-session');
      expect(events.map((e) => e.content).join('')).not.toContain('earlier answer');
      expect(events.filter((e) => e.type === 'delta').map((e) => e.content)).toEqual(['next']);
      await handle.close();
    });

    it('starts a fresh session when the agent no longer has the old one', async () => {
      const { executor, records } = setup({ loadableSessions: history });
      const handle = await executor.resumeSession('gone-session', { cwd: CWD });

      expect(records[0].loads).toEqual(['gone-session']);
      expect(records[0].newSessions).toEqual([{ cwd: CWD }]);
      expect(handle.sessionId).not.toBe('gone-session');
      await handle.close();
    });

    it('does not paper over a logged-out agent with a fresh session', async () => {
      const { executor, records } = setup({ authRequired: true, loadableSessions: history });

      await expect(executor.resumeSession('old-session', { cwd: CWD })).rejects.toThrow(
        profile.loginHint
      );
      expect(records[0].newSessions).toEqual([]);
    });
  });

  describe('model selection', () => {
    it('sets the mapped model when the agent offers it', async () => {
      const { executor, records } = setup({
        configOptions: [modelOption(['fake-default', 'fake-big'], 'fake-default')],
      });
      const handle = await executor.createSession({ cwd: CWD, model: 'big' });

      expect(records[0].configSets).toEqual([{ configId: 'model', value: 'fake-big' }]);
      await handle.close();
    });

    it('keeps the agent default and says so when the model is not offered', async () => {
      const { executor, records } = setup({
        configOptions: [modelOption(['fake-default'], 'fake-default')],
      });
      const handle = await executor.createSession({ cwd: CWD, model: 'big' });

      const events = await runTurn(handle, 'hi');

      expect(records[0].configSets).toEqual([]);
      expect(events[0]).toEqual({
        type: 'status',
        content: 'Fake Agent does not offer model "fake-big" in chat — using "fake-default".',
      });
      await handle.close();
    });

    it('keeps the agent default when switching the model fails', async () => {
      const { spawn, records } = fakeAcpSpawn({
        configOptions: [modelOption(['fake-default', 'fake-big'], 'fake-default')],
        setConfigError: new Error('model temporarily unavailable'),
      });
      const executor = new AcpInteractiveExecutor(spawn, profile);
      const handle = await executor.createSession({ cwd: CWD, model: 'big' });

      const events = await runTurn(handle, 'hi');

      expect(records[0].configSets).toEqual([{ configId: 'model', value: 'fake-big' }]);
      expect(events[0].type).toBe('status');
      expect(events[0].content).toMatch(/could not switch to model "fake-big".*using its default/);
      await handle.close();
    });

    it('does not touch the model when none was requested', async () => {
      const { executor, records } = setup({
        configOptions: [modelOption(['fake-default', 'fake-big'], 'fake-default')],
      });
      const handle = await executor.createSession({ cwd: CWD });

      expect(records[0].configSets).toEqual([]);
      await handle.close();
    });
  });

  describe('turn outcomes', () => {
    it.each([
      ['refusal', /refused/],
      ['max_tokens', /maximum number of tokens/],
      ['max_turn_requests', /maximum number of turn requests/],
    ] as const)('ends a %s turn with an error', async (stopReason, message) => {
      const { executor } = setup({ onPrompt: async () => ({ stopReason }) });
      const handle = await executor.createSession({ cwd: CWD });

      const events = await runTurn(handle, 'hi');

      expect(events.at(-1)).toMatchObject({ type: 'error' });
      expect(events.at(-1)?.content).toMatch(message);
      await handle.close();
    });

    it('reports a prompt the agent rejected', async () => {
      const { executor } = setup({
        onPrompt: async () => {
          throw new Error('model overloaded');
        },
      });
      const handle = await executor.createSession({ cwd: CWD });

      const events = await runTurn(handle, 'hi');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('error');
      expect(events[0].content).toContain('Fake Agent');
      await handle.close();
    });

    it('ends the turn with an error when the agent process dies mid-turn', async () => {
      const { executor, processes } = setup({
        onPrompt: async ({ update }) => {
          await update({
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'partial' },
          });
          processes[0].stderr.write('fatal: out of memory\n');
          processes[0].exit(137);
          return new Promise(() => undefined);
        },
      });
      const handle = await executor.createSession({ cwd: CWD });

      const events = await runTurn(handle, 'hi');

      expect(events.at(-1)?.type).toBe('error');
      expect(events.at(-1)?.content).toMatch(/exited with code 137/);
      expect(events.at(-1)?.content).toContain('out of memory');
      await expect(handle.send('again')).rejects.toThrow(/exited with code 137/);
    });

    it('flushes a trailing thought before done', async () => {
      const { executor } = setup({
        onPrompt: async ({ update }) => {
          await update({
            sessionUpdate: 'agent_thought_chunk',
            content: { type: 'text', text: 'pondering' },
          });
          return { stopReason: 'end_turn' };
        },
      });
      const handle = await executor.createSession({ cwd: CWD });

      const events = await runTurn(handle, 'hi');

      expect(events).toEqual([
        { type: 'thinking', content: 'pondering' },
        expect.objectContaining({ type: 'done' }),
      ]);
      await handle.close();
    });

    it('rejects a second send while a turn is still running', async () => {
      let release: () => void = () => undefined;
      const { executor, records } = setup({
        onPrompt: () =>
          new Promise((resolve) => (release = () => resolve({ stopReason: 'end_turn' }))),
      });
      const handle = await executor.createSession({ cwd: CWD });

      await handle.send('first');
      await expect(handle.send('second')).rejects.toThrow(/already in progress/);
      await expect.poll(() => records[0].prompts).toHaveLength(1);
      release();
      for await (const _ of handle.stream()) void _;
      await handle.close();
    });
  });

  describe('permissions', () => {
    it('approves tool permission requests once, without a permanent allowlist entry', async () => {
      let answer: string | null = 'unset';
      const { executor } = setup({
        onPrompt: async ({ client, sessionId }) => {
          const response = await client.request('session/request_permission', {
            sessionId,
            toolCall: { toolCallId: 'shell-1', title: 'rm -rf build' },
            options: [
              { optionId: 'allow-always', name: 'Allow always', kind: 'allow_always' },
              { optionId: 'allow-once', name: 'Allow', kind: 'allow_once' },
              { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
            ],
          });
          answer = selectedOption(response);
          return { stopReason: 'end_turn' };
        },
      });
      const handle = await executor.createSession({ cwd: CWD });

      await runTurn(handle, 'clean up');

      expect(answer).toBe('allow-once');
      await handle.close();
    });
  });

  describe('closing', () => {
    it('cancels the running turn, kills the agent and waits for it to exit', async () => {
      const { executor, processes, records } = setup({
        onPrompt: () => new Promise(() => undefined),
      });
      const handle = await executor.createSession({ cwd: CWD });
      await handle.send('long task');

      await handle.close();

      expect(records[0].cancels).toEqual([handle.sessionId]);
      expect(processes[0].killed).toBe(true);
      await expect(handle.send('after close')).rejects.toThrow(/closed/);
    });

    it('cancels the turn when the consumer stops reading early', async () => {
      const { executor, records } = setup({
        onPrompt: async ({ update, signal }) => {
          await update({
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'working' },
          });
          await new Promise((resolve) => signal.addEventListener('abort', resolve));
          return { stopReason: 'cancelled' };
        },
      });
      const handle = await executor.createSession({ cwd: CWD });
      await handle.send('go');

      for await (const event of handle.stream()) {
        if (event.type === 'delta') break;
      }

      await expect.poll(() => records[0].cancels).toEqual([handle.sessionId]);
      await handle.close();
    });

    it('abort() kills the agent immediately', async () => {
      const { executor, processes } = setup();
      const handle = await executor.createSession({ cwd: CWD });

      handle.abort();

      expect(processes[0].killed).toBe(true);
    });
  });
});
