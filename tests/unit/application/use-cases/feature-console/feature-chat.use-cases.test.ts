/**
 * Feature chat use cases Unit Tests (spec 147)
 *
 * The console's attach view talks to a feature's interactive chat through
 * these: a ready-to-render chat, sending, answering the agent's question, and
 * stopping the sessions the console started. None of them throws.
 *
 * TDD Phase: RED-GREEN-REFACTOR
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetFeatureChatUseCase } from '@/application/use-cases/feature-console/get-feature-chat.use-case.js';
import { SendFeatureChatMessageUseCase } from '@/application/use-cases/feature-console/send-feature-chat-message.use-case.js';
import { AnswerFeatureChatQuestionUseCase } from '@/application/use-cases/feature-console/answer-feature-chat-question.use-case.js';
import { StopFeatureChatsUseCase } from '@/application/use-cases/feature-console/stop-feature-chats.use-case.js';
import {
  ChatTurnStatus,
  FeatureChatEntryKind,
  InteractiveMessageRole,
} from '@/domain/generated/output.js';
import type { Feature, InteractiveMessage } from '@/domain/generated/output.js';
import { formatChatBlockMessage } from '@/domain/shared/chat-block.js';
import { formatInteractionAnswerMessage } from '@/domain/shared/interaction-answer.js';

const WORKTREE = '/home/u/.shep/repos/abc/wt/feat-login';

function message(
  id: string,
  role: InteractiveMessageRole,
  content: string,
  at = `2026-10-24T12:00:0${id}Z`
): InteractiveMessage {
  return {
    id,
    featureId: 'feat-1234567890',
    role,
    content,
    createdAt: new Date(at),
    updatedAt: new Date(at),
  } as InteractiveMessage;
}

describe('feature chat use cases', () => {
  let feature: Feature | null;
  let enabled: boolean;
  let chatState: Record<string, unknown>;
  let featureRepo: { findById: ReturnType<typeof vi.fn>; findByIdPrefix: ReturnType<typeof vi.fn> };
  let settings: { has: () => boolean; get: () => unknown };
  let worktreePaths: { getWorktreePath: () => string };
  let fileSystem: { pathExists: (p: string) => boolean };

  beforeEach(() => {
    feature = {
      id: 'feat-1234567890',
      name: 'Login page',
      repositoryPath: '/work/acme',
      branch: 'feat/login',
    } as Feature;
    enabled = true;
    chatState = {
      messages: [],
      sessionStatus: null,
      streamingText: null,
      sessionInfo: null,
      turnStatus: ChatTurnStatus.Idle,
      pendingInteraction: null,
      workflow: null,
    };
    featureRepo = {
      findById: vi.fn(async () => null),
      findByIdPrefix: vi.fn(async (p: string) => (feature?.id.startsWith(p) ? feature : null)),
    };
    settings = { has: () => true, get: () => ({ interactiveAgent: { enabled } }) };
    worktreePaths = { getWorktreePath: () => WORKTREE };
    fileSystem = { pathExists: (p) => p === WORKTREE };
  });

  describe('GetFeatureChatUseCase', () => {
    const getChat = () =>
      new GetFeatureChatUseCase(
        featureRepo as never,
        worktreePaths as never,
        fileSystem as never,
        settings as never,
        { execute: vi.fn(async () => chatState) } as never
      ).execute({ featureId: 'feat-1234', maxEntries: 50 });

    it('turns the conversation into entries ready to render', async () => {
      chatState.messages = [
        message('1', InteractiveMessageRole.user, 'Why is the login test flaky?'),
        message('2', InteractiveMessageRole.assistant, '**Read** `src/login.test.ts`'),
        message('3', InteractiveMessageRole.assistant, 'It waits on a fixed timeout.'),
        message(
          '4',
          InteractiveMessageRole.assistant,
          formatChatBlockMessage({ id: 'b1', type: 'plan_card', title: 'Fix plan' } as never)
        ),
        message(
          '5',
          InteractiveMessageRole.user,
          formatInteractionAnswerMessage({
            questions: [{ header: 'Scope', question: 'Fix the test or the code?' }],
            answers: { 'Fix the test or the code?': 'The test' },
          })
        ),
      ];

      const chat = await getChat();

      expect(chat).toMatchObject({
        featureId: 'feat-1234567890',
        name: 'Login page',
        directory: WORKTREE,
        available: true,
        busy: false,
        questions: [],
      });
      expect(chat.entries.map((e) => [e.kind, e.text])).toEqual([
        [FeatureChatEntryKind.User, 'Why is the login test flaky?'],
        [FeatureChatEntryKind.Tool, 'Read src/login.test.ts'],
        [FeatureChatEntryKind.Assistant, 'It waits on a fixed timeout.'],
        [FeatureChatEntryKind.Block, 'Plan: Fix plan'],
        [FeatureChatEntryKind.Answer, 'Fix the test or the code? → The test'],
      ]);
    });

    it('keeps only the newest entries', async () => {
      chatState.messages = Array.from({ length: 60 }, (_, i) =>
        message(
          String(i),
          InteractiveMessageRole.assistant,
          `line ${i}`,
          new Date(i * 1000).toISOString()
        )
      );

      const chat = await getChat();

      expect(chat.entries).toHaveLength(50);
      expect(chat.entries.at(-1)?.text).toBe('line 59');
    });

    it('reports a working agent, its streaming text and its pending question', async () => {
      chatState.turnStatus = ChatTurnStatus.Processing;
      chatState.sessionStatus = 'ready';
      chatState.streamingText = 'Looking at the';
      chatState.pendingInteraction = {
        toolCallId: 't1',
        questions: [
          {
            header: 'Scope',
            question: 'Fix the test or the code?',
            options: [
              { label: 'The test', description: 'Use a fake clock' },
              { label: 'The code' },
            ],
            multiSelect: false,
          },
        ],
      };

      const chat = await getChat();

      expect(chat.busy).toBe(true);
      expect(chat.streamingText).toBe('Looking at the');
      expect(chat.questions).toEqual([
        {
          header: 'Scope',
          question: 'Fix the test or the code?',
          options: [{ label: 'The test', description: 'Use a fake clock' }, { label: 'The code' }],
          multiSelect: false,
        },
      ]);
    });

    it('says when the interactive agent is turned off, and when the feature is unknown', async () => {
      enabled = false;
      expect(await getChat()).toMatchObject({
        available: false,
        unavailableReason: 'The interactive agent is turned off in settings.',
      });

      feature = null;
      expect(await getChat()).toMatchObject({
        available: false,
        unavailableReason: 'Feature not found: feat-1234',
        entries: [],
      });
    });
  });

  describe('SendFeatureChatMessageUseCase', () => {
    let send: ReturnType<typeof vi.fn>;
    const sendMessage = (content: string) =>
      new SendFeatureChatMessageUseCase(
        featureRepo as never,
        worktreePaths as never,
        fileSystem as never,
        settings as never,
        { execute: send } as never
      ).execute({ featureId: 'feat-1234', content });

    beforeEach(() => {
      send = vi.fn(async () => ({}));
    });

    it('sends through the interactive session in the feature directory', async () => {
      expect(await sendMessage('  Use a fake clock  ')).toEqual({ ok: true, message: 'Sent' });
      expect(send).toHaveBeenCalledWith({
        featureId: 'feat-1234567890',
        content: 'Use a fake clock',
        worktreePath: WORKTREE,
      });
    });

    it('refuses empty text and a disabled agent, and reports a failure', async () => {
      expect(await sendMessage('   ')).toEqual({ ok: false, message: 'Type a message first.' });
      enabled = false;
      expect((await sendMessage('hi')).ok).toBe(false);
      enabled = true;
      send.mockRejectedValue(new Error('Agent "gemini-cli" has no interactive mode'));
      expect(await sendMessage('hi')).toEqual({
        ok: false,
        message: 'Agent "gemini-cli" has no interactive mode',
      });
    });
  });

  describe('AnswerFeatureChatQuestionUseCase', () => {
    it('answers by question text', async () => {
      const respond = vi.fn(async () => undefined);
      const useCase = new AnswerFeatureChatQuestionUseCase(
        featureRepo as never,
        {
          execute: respond,
        } as never
      );

      const result = await useCase.execute({
        featureId: 'feat-1234',
        answers: { 'Fix the test or the code?': 'The test' },
      });

      expect(result).toEqual({ ok: true, message: 'Answered' });
      expect(respond).toHaveBeenCalledWith({
        featureId: 'feat-1234567890',
        answers: { 'Fix the test or the code?': 'The test' },
      });
    });
  });

  describe('StopFeatureChatsUseCase', () => {
    it('stops each session and survives a failure', async () => {
      const stop = vi.fn(async ({ featureId }: { featureId: string }) => {
        if (featureId === 'b') throw new Error('gone');
      });
      await new StopFeatureChatsUseCase({ execute: stop } as never).execute(['a', 'b', 'c']);
      expect(stop).toHaveBeenCalledTimes(3);
    });
  });
});
