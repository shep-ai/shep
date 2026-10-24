/**
 * Mock interactive executor (spec 147).
 *
 * With SHEP_MOCK_EXECUTOR=1, interactive chat sessions get this deterministic
 * agent instead of a real CLI, so e2e tests can attach to a feature, send a
 * message, read the reply and answer a question. Each message gets one tool
 * call and a reply quoting its last line (a boot prompt ends with the user's
 * message); a message containing "ask me"
 * gets a two-option question first, asked the way the real executor asks
 * (the agent question bridge, else onUserQuestion).
 */

import { randomUUID } from 'node:crypto';
import type {
  IInteractiveAgentExecutor,
  InteractiveAgentEvent,
  InteractiveAgentOptions,
  InteractiveAgentSessionHandle,
  UserQuestion,
} from '../../../../../application/ports/output/agents/interactive-agent-executor.interface.js';

const ASK_TRIGGER = /ask me/i;
const SESSION_ID_PREFIX = 'mock-';

const MOCK_QUESTION: UserQuestion = {
  header: 'Mock',
  question: 'Which option?',
  options: [
    { label: 'First', description: 'The first option' },
    { label: 'Second', description: 'The second option' },
  ],
  multiSelect: false,
};

class MockInteractiveSession implements InteractiveAgentSessionHandle {
  private readonly inbox: string[] = [];

  constructor(
    readonly sessionId: string,
    private readonly options: InteractiveAgentOptions
  ) {}

  async send(message: string): Promise<void> {
    this.inbox.push(message);
  }

  async sendToolResult(): Promise<void> {
    // The mock asks through callbacks; tool results need no reply.
  }

  async *stream(): AsyncIterable<InteractiveAgentEvent> {
    const message = this.inbox.shift() ?? '';
    if (ASK_TRIGGER.test(message)) {
      const answers = await this.ask();
      yield {
        type: 'delta',
        content: `Mock agent: you picked "${answers[MOCK_QUESTION.question] ?? ''}".`,
      };
      yield { type: 'done' };
      return;
    }
    yield { type: 'tool_use', label: 'Read', detail: 'README.md' };
    // A boot prompt is the feature context with the user's message last.
    const lastLine = message.trim().split('\n').at(-1)?.trim() ?? '';
    yield { type: 'delta', content: 'Mock agent: ' };
    yield { type: 'delta', content: `you said "${lastLine}".` };
    yield { type: 'done' };
  }

  async close(): Promise<void> {
    this.inbox.length = 0;
  }

  abort(): void {
    this.inbox.length = 0;
  }

  private async ask(): Promise<Record<string, string>> {
    const toolCallId = randomUUID();
    const questions = [MOCK_QUESTION];
    const bridged = await this.options.agentQuestionBridge?.ask({ toolCallId, questions });
    if (bridged) return bridged;
    return (await this.options.onUserQuestion?.({ toolCallId, questions })) ?? {};
  }
}

export class MockInteractiveExecutor implements IInteractiveAgentExecutor {
  async createSession(options: InteractiveAgentOptions): Promise<InteractiveAgentSessionHandle> {
    return new MockInteractiveSession(`${SESSION_ID_PREFIX}${randomUUID()}`, options);
  }

  async resumeSession(
    sessionId: string,
    options: InteractiveAgentOptions
  ): Promise<InteractiveAgentSessionHandle> {
    return new MockInteractiveSession(sessionId, options);
  }
}
