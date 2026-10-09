/**
 * shep agent questions * — CLI command tests
 *
 * Stubs the DI container and the three use cases, then verifies that
 * each subcommand parses its options and forwards the right inputs.
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AgentQuestionAnswerer,
  AgentQuestionKind,
  AgentQuestionStatus,
  type AgentQuestion,
} from '@/domain/generated/output.js';

const { mockResolve, listExecute, answerExecute, cancelExecute, promptDecision } = vi.hoisted(
  () => ({
    mockResolve: vi.fn(),
    listExecute: vi.fn(),
    answerExecute: vi.fn(),
    cancelExecute: vi.fn(),
    promptDecision: vi.fn(),
  })
);

vi.mock(
  '../../../../../../../src/presentation/cli/commands/agent/questions/decision-renderer.js',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    promptDecision: (...args: unknown[]) => promptDecision(...args),
  })
);

vi.mock('@/infrastructure/di/container.js', () => ({
  container: {
    resolve: (...args: unknown[]) => mockResolve(...args),
  },
}));

vi.mock('@/application/use-cases/agents/list-agent-questions.use-case.js', () => ({
  ListAgentQuestionsUseCase: class {
    execute = listExecute;
  },
}));
vi.mock('@/application/use-cases/agents/answer-agent-question.use-case.js', () => ({
  AnswerAgentQuestionUseCase: class {
    execute = answerExecute;
  },
}));
vi.mock('@/application/use-cases/agents/cancel-agent-question.use-case.js', () => ({
  CancelAgentQuestionUseCase: class {
    execute = cancelExecute;
  },
}));

import { createListCommand } from '../../../../../../../src/presentation/cli/commands/agent/questions/ls.command.js';
import { createAnswerCommand } from '../../../../../../../src/presentation/cli/commands/agent/questions/answer.command.js';
import { createCancelCommand } from '../../../../../../../src/presentation/cli/commands/agent/questions/cancel.command.js';

function question(overrides: Partial<AgentQuestion> = {}): AgentQuestion {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    appId: 'app-1',
    featureId: 'feat-1',
    agentRunId: 'run-12345678-9012-3456-7890-1234567890ab',
    kind: AgentQuestionKind.question,
    prompt: 'Should we ship?',
    answerer: AgentQuestionAnswerer.user,
    status: AgentQuestionStatus.pending,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('shep agent questions commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.exitCode = undefined;
    mockResolve.mockImplementation((cls: { name?: string }) => {
      const name = cls.name;
      switch (name) {
        case 'ListAgentQuestionsUseCase':
          return { execute: listExecute };
        case 'AnswerAgentQuestionUseCase':
          return { execute: answerExecute };
        case 'CancelAgentQuestionUseCase':
          return { execute: cancelExecute };
        default:
          throw new Error(`Unknown class in test stub: ${name}`);
      }
    });
  });

  it('ls forwards filters to ListAgentQuestionsUseCase', async () => {
    listExecute.mockResolvedValue([question()]);
    const cmd = createListCommand();
    await cmd.parseAsync(['--app', 'app-1', '--status', 'pending', '--limit', '20'], {
      from: 'user',
    });
    expect(listExecute).toHaveBeenCalledWith({
      appId: 'app-1',
      featureId: undefined,
      status: AgentQuestionStatus.pending,
      limit: 20,
    });
  });

  it('answer invokes AnswerAgentQuestionUseCase with the supplied answer', async () => {
    answerExecute.mockResolvedValue({
      enabled: true,
      forwardedToGate: false,
      question: question({ status: AgentQuestionStatus.answered, answer: 'use react-flow' }),
    });
    const cmd = createAnswerCommand();
    await cmd.parseAsync(
      ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '--app', 'app-1', '--answer', 'use react-flow'],
      { from: 'user' }
    );
    expect(answerExecute).toHaveBeenCalledWith({
      appId: 'app-1',
      questionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      answer: 'use react-flow',
      answeredBy: 'user:cli',
    });
  });

  it('answer surfaces a non-zero exit code when the flag is off', async () => {
    answerExecute.mockResolvedValue({ enabled: false, forwardedToGate: false });
    const cmd = createAnswerCommand();
    await cmd.parseAsync(
      ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '--app', 'app-1', '--answer', 'yes'],
      { from: 'user' }
    );
    expect(process.exitCode).toBe(1);
  });

  it('answer fails when the question was already settled by someone else', async () => {
    answerExecute.mockResolvedValue({
      enabled: true,
      forwardedToGate: false,
      question: question({ status: AgentQuestionStatus.answered, answer: 'other answer' }),
      alreadySettledAs: AgentQuestionStatus.answered,
    });
    const cmd = createAnswerCommand();
    await cmd.parseAsync(
      ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '--app', 'app-1', '--answer', 'yes'],
      { from: 'user' }
    );
    // The answer was NOT recorded; reporting success would be a lie.
    expect(process.exitCode).toBe(1);
  });

  it('cancel fails when the question was already settled by someone else', async () => {
    cancelExecute.mockResolvedValue({
      enabled: true,
      question: question({ status: AgentQuestionStatus.answered }),
      alreadySettledAs: AgentQuestionStatus.answered,
    });
    const cmd = createCancelCommand();
    await cmd.parseAsync(['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '--app', 'app-1'], {
      from: 'user',
    });
    expect(process.exitCode).toBe(1);
  });

  it('cancel invokes CancelAgentQuestionUseCase with cancelledBy + reason', async () => {
    cancelExecute.mockResolvedValue({
      enabled: true,
      question: question({ status: AgentQuestionStatus.cancelled }),
    });
    const cmd = createCancelCommand();
    await cmd.parseAsync(
      [
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        '--app',
        'app-1',
        '--reason',
        'no longer needed',
        '--cancelled-by',
        'user:alice',
      ],
      { from: 'user' }
    );
    expect(cancelExecute).toHaveBeenCalledWith({
      appId: 'app-1',
      questionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      reason: 'no longer needed',
      cancelledBy: 'user:alice',
    });
  });

  describe('decisions (spec 134)', () => {
    const originalIsTTY = process.stdin.isTTY;
    afterEach(() => {
      process.stdin.isTTY = originalIsTTY;
    });

    it('ls shows a gate question as a sentence, not JSON', async () => {
      const log = vi.spyOn(console, 'log');
      listExecute.mockResolvedValue([
        question({
          prompt: JSON.stringify({ event: 'waiting_approval', node: 'plan' }),
          optionsJson: '["approve","reject"]',
        }),
      ]);
      await createListCommand().parseAsync(['--app', 'app-1'], { from: 'user' });
      const output = log.mock.calls.flat().join('\n');
      expect(output).toContain('The implementation plan is ready for review');
      expect(output).not.toContain('waiting_approval');
    });

    it('answer without --answer renders the decision and records the chosen responses', async () => {
      process.stdin.isTTY = true;
      listExecute.mockResolvedValue([question({ optionsJson: '["yes","no"]' })]);
      promptDecision.mockResolvedValue([{ questionId: 'q1', optionIds: ['yes'] }]);
      answerExecute.mockResolvedValue({
        enabled: true,
        forwardedToGate: false,
        question: question({ status: AgentQuestionStatus.answered }),
      });

      await createAnswerCommand().parseAsync(
        ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '--app', 'app-1'],
        {
          from: 'user',
        }
      );

      expect(promptDecision).toHaveBeenCalled();
      expect(answerExecute).toHaveBeenCalledWith({
        appId: 'app-1',
        questionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        responses: [{ questionId: 'q1', optionIds: ['yes'] }],
        answeredBy: 'user:cli',
      });
    });

    it('answer without --answer fails when stdin is not interactive', async () => {
      process.stdin.isTTY = false;
      await createAnswerCommand().parseAsync(
        ['aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', '--app', 'app-1'],
        {
          from: 'user',
        }
      );
      expect(process.exitCode).toBe(1);
      expect(answerExecute).not.toHaveBeenCalled();
    });
  });
});
