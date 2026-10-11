/**
 * Chat block use cases (spec 137): an agent posts a block into a
 * conversation, the user answers it, and an open chat picks up rows that
 * another process wrote.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PostChatBlockUseCase } from '@/application/use-cases/interactive/post-chat-block.use-case.js';
import { RespondToChatBlockUseCase } from '@/application/use-cases/interactive/respond-to-chat-block.use-case.js';
import { ListChatMessagesSinceUseCase } from '@/application/use-cases/interactive/list-chat-messages-since.use-case.js';
import type { IInteractiveSessionService } from '@/application/ports/output/services/interactive-session-service.interface.js';
import {
  ChatBlockAction,
  ChatBlockType,
  InteractiveMessageRole,
} from '@/domain/generated/output.js';
import {
  formatChatBlockResponseMessage,
  parseChatBlockMessage,
  parseChatBlockResponseMessage,
} from '@/domain/shared/chat-block.js';
import { InvalidChatBlockError } from '@/domain/errors/invalid-chat-block.error.js';
import { ChatBlockNotFoundError } from '@/domain/errors/chat-block-not-found.error.js';
import { ChatBlockAlreadyAnsweredError } from '@/domain/errors/chat-block-already-answered.error.js';
import { InMemoryInteractiveMessageRepository } from '../../../../helpers/in-memory-interactive-message-repository.js';

const SCOPE = 'repo-r1';

function sessionServiceDouble() {
  return { sendUserMessage: vi.fn().mockResolvedValue(undefined) };
}

describe('PostChatBlockUseCase', () => {
  let messages: InMemoryInteractiveMessageRepository;
  let useCase: PostChatBlockUseCase;

  beforeEach(() => {
    messages = new InMemoryInteractiveMessageRepository();
    useCase = new PostChatBlockUseCase(messages);
  });

  it('stores the block as an assistant message of the conversation', async () => {
    const result = await useCase.execute({
      scope: SCOPE,
      type: ChatBlockType.PlanCard,
      title: 'Dark mode',
      markdown: '1. Tokens',
    });

    expect(messages.messages).toHaveLength(1);
    const [row] = messages.messages;
    expect(row).toMatchObject({ featureId: SCOPE, role: InteractiveMessageRole.assistant });
    expect(parseChatBlockMessage(row.content)).toEqual({
      id: result.block.id,
      type: ChatBlockType.PlanCard,
      title: 'Dark mode',
      markdown: '1. Tokens',
    });
    expect(result.message.id).toBe(row.id);
  });

  it('gives every block its own id', async () => {
    const input = { scope: SCOPE, type: ChatBlockType.PlanCard, title: 'P', markdown: 'm' };
    const a = await useCase.execute(input);
    const b = await useCase.execute(input);
    expect(a.block.id).not.toBe(b.block.id);
  });

  it('rejects an unknown conversation scope and stores nothing', async () => {
    await expect(
      useCase.execute({ scope: '../x', type: ChatBlockType.PlanCard, title: 'P', markdown: 'm' })
    ).rejects.toThrow(InvalidChatBlockError);
    expect(messages.messages).toHaveLength(0);
  });

  it('rejects an invalid block and stores nothing', async () => {
    await expect(
      useCase.execute({ scope: SCOPE, type: ChatBlockType.HtmlPreview, title: 'P' })
    ).rejects.toThrow(InvalidChatBlockError);
    expect(messages.messages).toHaveLength(0);
  });
});

describe('RespondToChatBlockUseCase', () => {
  let messages: InMemoryInteractiveMessageRepository;
  let sessions: ReturnType<typeof sessionServiceDouble>;
  let respond: RespondToChatBlockUseCase;
  let specId: string;

  beforeEach(async () => {
    messages = new InMemoryInteractiveMessageRepository();
    sessions = sessionServiceDouble();
    respond = new RespondToChatBlockUseCase(
      messages,
      sessions as unknown as IInteractiveSessionService
    );
    const posted = await new PostChatBlockUseCase(messages).execute({
      scope: SCOPE,
      type: ChatBlockType.SpecReview,
      title: 'Login PRD',
      markdown: '# Login',
    });
    specId = posted.block.id;
  });

  it('records the answer in the conversation and tells the agent in plain words', async () => {
    const result = await respond.execute({
      scope: SCOPE,
      blockId: specId,
      action: ChatBlockAction.RequestChanges,
      note: 'Add SSO',
      worktreePath: '/repo',
    });

    const row = messages.messages.at(-1)!;
    expect(row.role).toBe(InteractiveMessageRole.user);
    expect(parseChatBlockResponseMessage(row.content)).toEqual({
      blockId: specId,
      action: ChatBlockAction.RequestChanges,
      note: 'Add SSO',
    });
    expect(result.message.id).toBe(row.id);
    // The agent reads a sentence; the timeline keeps only the marker row.
    expect(sessions.sendUserMessage).toHaveBeenCalledWith(
      SCOPE,
      'The user requested changes to the spec "Login PRD": Add SSO\nRevise the spec and post it again for review.',
      '/repo',
      undefined,
      undefined,
      undefined,
      undefined,
      false
    );
  });

  it('stores nothing when the agent cannot be told, so the block stays open to retry', async () => {
    sessions.sendUserMessage.mockRejectedValue(
      Object.assign(new Error('3 of 3 sessions are active'), { code: 'CONCURRENT_SESSION_LIMIT' })
    );
    const before = messages.messages.length;

    await expect(
      respond.execute({
        scope: SCOPE,
        blockId: specId,
        action: ChatBlockAction.Approve,
        worktreePath: '/repo',
      })
    ).rejects.toThrow('3 of 3 sessions are active');
    expect(messages.messages).toHaveLength(before);
  });

  it('dates the stored answer before the agent was told, so it sorts ahead of the reply', async () => {
    let toldAt = 0;
    sessions.sendUserMessage.mockImplementation(async () => {
      toldAt = Date.now();
      await new Promise((r) => setTimeout(r, 5));
    });
    await respond.execute({
      scope: SCOPE,
      blockId: specId,
      action: ChatBlockAction.Approve,
      worktreePath: '/repo',
    });
    const row = messages.messages.at(-1)!;
    expect(new Date(row.createdAt).getTime()).toBeLessThanOrEqual(toldAt);
  });

  it('refuses a block that is not in this conversation', async () => {
    await expect(
      respond.execute({
        scope: 'global',
        blockId: specId,
        action: ChatBlockAction.Approve,
        worktreePath: '/repo',
      })
    ).rejects.toThrow(ChatBlockNotFoundError);
    expect(sessions.sendUserMessage).not.toHaveBeenCalled();
  });

  it('refuses an action the block does not take', async () => {
    await expect(
      respond.execute({
        scope: SCOPE,
        blockId: specId,
        action: ChatBlockAction.Implement,
        worktreePath: '/repo',
      })
    ).rejects.toThrow(InvalidChatBlockError);
    expect(sessions.sendUserMessage).not.toHaveBeenCalled();
  });

  it('refuses a second answer to the same block', async () => {
    await messages.create({
      id: 'earlier',
      featureId: SCOPE,
      role: InteractiveMessageRole.user,
      content: formatChatBlockResponseMessage({ blockId: specId, action: ChatBlockAction.Approve }),
      createdAt: new Date(Date.now() + 1000),
      updatedAt: new Date(),
    });
    await expect(
      respond.execute({
        scope: SCOPE,
        blockId: specId,
        action: ChatBlockAction.Approve,
        worktreePath: '/repo',
      })
    ).rejects.toThrow(ChatBlockAlreadyAnsweredError);
    expect(sessions.sendUserMessage).not.toHaveBeenCalled();
  });
});

describe('ListChatMessagesSinceUseCase', () => {
  it('returns the newer rows of one conversation', async () => {
    const messages = new InMemoryInteractiveMessageRepository();
    const base = { role: InteractiveMessageRole.assistant, content: 'x', updatedAt: new Date(0) };
    await messages.create({ ...base, id: 'a', featureId: SCOPE, createdAt: new Date(1000) });
    await messages.create({ ...base, id: 'b', featureId: SCOPE, createdAt: new Date(3000) });
    await messages.create({ ...base, id: 'c', featureId: 'global', createdAt: new Date(3000) });

    const rows = await new ListChatMessagesSinceUseCase(messages).execute({
      scope: SCOPE,
      since: new Date(2000),
    });

    expect(rows.map((m) => m.id)).toEqual(['b']);
  });
});
