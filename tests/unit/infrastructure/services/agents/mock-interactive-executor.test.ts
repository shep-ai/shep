/**
 * MockInteractiveExecutor Unit Tests (spec 147)
 *
 * With SHEP_MOCK_EXECUTOR=1 the interactive chat needs a deterministic agent
 * too, so e2e tests can attach to a feature, send a message, read the reply
 * and answer a question without a real agent CLI.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import { describe, it, expect, vi } from 'vitest';
import { MockInteractiveExecutor } from '@/infrastructure/services/agents/common/executors/mock-interactive-executor.service.js';
import { MockAgentExecutorFactory } from '@/infrastructure/services/agents/common/executors/mock-executor-factory.service.js';
import { AgentType } from '@/domain/generated/output.js';
import type { InteractiveAgentEvent } from '@/application/ports/output/agents/interactive-agent-executor.interface.js';

async function collect(stream: AsyncIterable<InteractiveAgentEvent>) {
  const events: InteractiveAgentEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

const text = (events: InteractiveAgentEvent[]) =>
  events
    .filter((e) => e.type === 'delta')
    .map((e) => e.content)
    .join('');

describe('MockInteractiveExecutor', () => {
  it('answers each message with a tool call and a reply that quotes it, then done', async () => {
    const session = await new MockInteractiveExecutor().createSession({ cwd: '/wt' });
    expect(session.sessionId).toMatch(/^mock-/);

    // A boot prompt: the feature context, then the user's message.
    await session.send('# Shep Interactive Agent\ncontext\n\nWhy is the test flaky?\n');
    const events = await collect(session.stream());

    expect(events.find((e) => e.type === 'tool_use')).toMatchObject({
      label: 'Read',
      detail: 'README.md',
    });
    expect(text(events)).toBe('Mock agent: you said "Why is the test flaky?".');
    expect(events.at(-1)?.type).toBe('done');
  });

  it('asks a question when told to, and replies with the answer', async () => {
    const onUserQuestion = vi.fn(async () => ({ 'Which option?': 'Second' }));
    const session = await new MockInteractiveExecutor().createSession({
      cwd: '/wt',
      onUserQuestion,
    });

    await session.send('please ask me something');
    const events = await collect(session.stream());

    expect(onUserQuestion).toHaveBeenCalledWith({
      toolCallId: expect.any(String),
      questions: [
        expect.objectContaining({
          question: 'Which option?',
          options: [
            expect.objectContaining({ label: 'First' }),
            expect.objectContaining({ label: 'Second' }),
          ],
        }),
      ],
    });
    expect(text(events)).toBe('Mock agent: you picked "Second".');
  });

  it('prefers the agent question bridge, as the real executor does', async () => {
    const bridge = { ask: vi.fn(async () => ({ 'Which option?': 'First' })) };
    const onUserQuestion = vi.fn();
    const session = await new MockInteractiveExecutor().createSession({
      cwd: '/wt',
      agentQuestionBridge: bridge,
      onUserQuestion,
    });
    await session.send('ask me');
    expect(text(await collect(session.stream()))).toBe('Mock agent: you picked "First".');
    expect(onUserQuestion).not.toHaveBeenCalled();
  });

  it('resumes a session under its id', async () => {
    const session = await new MockInteractiveExecutor().resumeSession('mock-123', { cwd: '/wt' });
    expect(session.sessionId).toBe('mock-123');
  });

  it('is what the mock factory hands out for interactive sessions', () => {
    const factory = new MockAgentExecutorFactory();
    expect(factory.supportsInteractive(AgentType.ClaudeCode)).toBe(true);
    expect(factory.createInteractiveExecutor(AgentType.ClaudeCode, {} as never)).toBeInstanceOf(
      MockInteractiveExecutor
    );
  });
});
