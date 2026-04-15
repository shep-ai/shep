/**
 * GetChatTurnGroupsUseCase unit tests.
 *
 * The use case derives "turn groups" from the raw interactive_messages
 * history for a feature. A turn group is a user message plus every
 * consecutive assistant reply until the next user message. The
 * MOST RECENT turn stays live (not grouped) so the user always sees
 * the current reply streaming; completed turns get collapsed into a
 * single named card on the client.
 *
 * Messages that already carry a `stepId` belong to the setup workflow
 * and are ignored here — those live inside the StepTracker, not the
 * flat thread.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import type { IInteractiveMessageRepository } from '@/application/ports/output/repositories/interactive-message-repository.interface.js';
import type { InteractiveMessage } from '@/domain/generated/output.js';
import { InteractiveMessageRole } from '@/domain/generated/output.js';
import { GetChatTurnGroupsUseCase } from '@/application/use-cases/interactive/get-chat-turn-groups.use-case.js';

function msg(
  id: string,
  role: InteractiveMessageRole,
  content: string,
  createdAtMs: number,
  stepId?: string
): InteractiveMessage {
  return {
    id,
    featureId: 'feat-1',
    role,
    content,
    createdAt: new Date(createdAtMs) as unknown as InteractiveMessage['createdAt'],
    updatedAt: new Date(createdAtMs) as unknown as InteractiveMessage['updatedAt'],
    stepId,
  };
}

class FakeRepo implements IInteractiveMessageRepository {
  messages: InteractiveMessage[] = [];
  async create(): Promise<void> {
    // The use case under test is read-only; writes never fire.
    return;
  }
  async findByFeatureId(): Promise<InteractiveMessage[]> {
    return [...this.messages];
  }
  async findBySessionId(): Promise<InteractiveMessage[]> {
    return [];
  }
  async deleteByFeatureId(): Promise<void> {
    // The use case under test is read-only; deletes never fire.
    return;
  }
}

describe('GetChatTurnGroupsUseCase', () => {
  let repo: FakeRepo;
  let useCase: GetChatTurnGroupsUseCase;

  beforeEach(() => {
    repo = new FakeRepo();
    useCase = new GetChatTurnGroupsUseCase(repo);
  });

  it('returns empty when the feature has no messages', async () => {
    const result = await useCase.execute({ featureId: 'feat-1' });
    expect(result.groups).toEqual([]);
    expect(result.currentTurn).toBeNull();
    expect(result.hiddenMessageIds).toEqual([]);
  });

  it('ignores messages that carry a stepId (those belong to setup)', async () => {
    repo.messages = [
      msg('m1', InteractiveMessageRole.user, 'Build it', 1000, 'step-1'),
      msg('m2', InteractiveMessageRole.assistant, 'done', 2000, 'step-1'),
    ];
    const result = await useCase.execute({ featureId: 'feat-1' });
    expect(result.groups).toEqual([]);
    expect(result.currentTurn).toBeNull();
    expect(result.hiddenMessageIds).toEqual([]);
  });

  it('emits the only live turn as currentTurn (in-progress) and hides its messages', async () => {
    repo.messages = [
      msg('m1', InteractiveMessageRole.user, 'Fix bug X', 1000),
      msg('m2', InteractiveMessageRole.assistant, 'Working…', 2000),
    ];
    const result = await useCase.execute({ featureId: 'feat-1' });
    expect(result.groups).toEqual([]);
    expect(result.currentTurn).not.toBeNull();
    expect(result.currentTurn?.status).toBe('in-progress');
    expect(result.currentTurn?.messageIds).toEqual(['m1', 'm2']);
    expect(result.hiddenMessageIds).toEqual(['m1', 'm2']);
  });

  it('groups every completed turn and promotes the latest to currentTurn', async () => {
    repo.messages = [
      // completed turn
      msg('u1', InteractiveMessageRole.user, 'Fix bug X', 1000),
      msg('a1', InteractiveMessageRole.assistant, 'fixed', 2000),
      msg('a2', InteractiveMessageRole.assistant, 'also cleaned up', 2500),
      // live turn
      msg('u2', InteractiveMessageRole.user, 'Add feature Y', 3000),
      msg('a3', InteractiveMessageRole.assistant, 'adding…', 4000),
    ];
    const result = await useCase.execute({ featureId: 'feat-1' });

    expect(result.groups).toHaveLength(1);
    const [g] = result.groups;
    expect(g.id).toBe('turn-u1');
    expect(g.status).toBe('completed');
    expect(g.messageIds).toEqual(['u1', 'a1', 'a2']);

    expect(result.currentTurn).not.toBeNull();
    expect(result.currentTurn?.id).toBe('turn-u2');
    expect(result.currentTurn?.status).toBe('in-progress');
    expect(result.currentTurn?.messageIds).toEqual(['u2', 'a3']);

    // BOTH completed and current turn ids are hidden from the flat
    // thread — the in-progress card now owns the live bubbles.
    expect(result.hiddenMessageIds).toEqual(['u1', 'a1', 'a2', 'u2', 'a3']);
  });

  it('produces one group per completed user turn in chronological order', async () => {
    repo.messages = [
      msg('u1', InteractiveMessageRole.user, 'First ask', 1000),
      msg('a1', InteractiveMessageRole.assistant, 'first reply', 1500),
      msg('u2', InteractiveMessageRole.user, 'Second ask', 2000),
      msg('a2', InteractiveMessageRole.assistant, 'second reply', 2500),
      msg('u3', InteractiveMessageRole.user, 'Third ask — the live one', 3000),
    ];
    const result = await useCase.execute({ featureId: 'feat-1' });

    expect(result.groups.map((g) => g.id)).toEqual(['turn-u1', 'turn-u2']);
    expect(result.groups[0].messageIds).toEqual(['u1', 'a1']);
    expect(result.groups[1].messageIds).toEqual(['u2', 'a2']);
    expect(result.currentTurn?.id).toBe('turn-u3');
    expect(result.currentTurn?.messageIds).toEqual(['u3']);
    expect(result.hiddenMessageIds).toEqual(['u1', 'a1', 'u2', 'a2', 'u3']);
  });

  it('truncates long user messages in the preview and title', async () => {
    const longAsk = 'a'.repeat(500);
    repo.messages = [
      msg('u1', InteractiveMessageRole.user, longAsk, 1000),
      msg('a1', InteractiveMessageRole.assistant, 'ok', 2000),
      msg('u2', InteractiveMessageRole.user, 'live', 3000),
    ];
    const result = await useCase.execute({ featureId: 'feat-1' });
    const [g] = result.groups;
    expect(g.userMessagePreview.length).toBeLessThanOrEqual(120);
    expect(g.title.length).toBeLessThanOrEqual(140);
    expect(g.title.startsWith('Working on')).toBe(true);
  });

  it('assigns a descriptive fallback title when the user message is empty', async () => {
    repo.messages = [
      msg('u1', InteractiveMessageRole.user, '   ', 1000),
      msg('a1', InteractiveMessageRole.assistant, 'ok', 2000),
      msg('u2', InteractiveMessageRole.user, 'live', 3000),
    ];
    const result = await useCase.execute({ featureId: 'feat-1' });
    expect(result.groups[0].title).toBe('Working on your request');
  });

  it('leaves a trailing assistant orphan (no preceding user message) alone', async () => {
    repo.messages = [
      msg('a0', InteractiveMessageRole.assistant, 'hi', 500),
      msg('u1', InteractiveMessageRole.user, 'Fix bug', 1000),
      msg('a1', InteractiveMessageRole.assistant, 'done', 1500),
      msg('u2', InteractiveMessageRole.user, 'live', 2000),
    ];
    const result = await useCase.execute({ featureId: 'feat-1' });
    expect(result.groups.map((g) => g.id)).toEqual(['turn-u1']);
    expect(result.currentTurn?.id).toBe('turn-u2');
    expect(result.hiddenMessageIds).toEqual(['u1', 'a1', 'u2']);
  });
});
