/**
 * RouteWhatsAppReplyUseCase unit tests (spec 101)
 */

import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RouteWhatsAppReplyUseCase } from '@/application/use-cases/whatsapp/route-whatsapp-reply.use-case.js';
import { WhatsAppMessageKind } from '@/application/use-cases/whatsapp/whatsapp-message.types.js';
import { WhatsAppThreadTargetKind } from '@/domain/generated/output.js';
import type { WhatsAppThreadMapping } from '@/application/ports/output/repositories/whatsapp-thread-mapping-repository.interface.js';

function appMapping(): WhatsAppThreadMapping {
  return {
    threadId: 'thread-1',
    targetKind: WhatsAppThreadTargetKind.Application,
    targetId: 'app-123',
    active: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

function setup(app: unknown, opts?: { run?: unknown }) {
  const applicationRepo = { findById: vi.fn().mockResolvedValue(app) } as any;
  const sendInteractiveMessage = { execute: vi.fn().mockResolvedValue({ id: 'msg-1' }) } as any;
  const threadMappings = {
    upsert: vi.fn(),
    findByThread: vi.fn(),
    findActiveByTarget: vi.fn(),
    deactivate: vi.fn().mockResolvedValue(undefined),
  } as any;
  const agentRunRepo = {
    findLatestByFeatureId: vi
      .fn()
      .mockResolvedValue('run' in (opts ?? {}) ? opts!.run : { id: 'run-1' }),
  } as any;
  const approveAgentRun = {
    execute: vi.fn().mockResolvedValue({ approved: true, reason: 'ok' }),
  } as any;
  const rejectAgentRun = {
    execute: vi.fn().mockResolvedValue({ rejected: true, reason: 'ok' }),
  } as any;
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any;
  const useCase = new RouteWhatsAppReplyUseCase(
    applicationRepo,
    sendInteractiveMessage,
    threadMappings,
    agentRunRepo,
    approveAgentRun,
    rejectAgentRun,
    logger
  );
  return {
    useCase,
    applicationRepo,
    sendInteractiveMessage,
    threadMappings,
    agentRunRepo,
    approveAgentRun,
    rejectAgentRun,
    logger,
  };
}

function featureMapping() {
  return {
    threadId: 'thread-2',
    targetKind: WhatsAppThreadTargetKind.Feature,
    targetId: 'feat-1',
    active: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('RouteWhatsAppReplyUseCase', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup({
      id: 'app-123',
      repositoryPath: '/repos/todo',
      agentType: 'claude-code',
      modelOverride: 'claude-sonnet-4-6',
    });
  });

  it('forwards a reply into the application interactive session', async () => {
    const result = await env.useCase.execute({ mapping: appMapping(), text: 'add dark mode' });

    expect(env.sendInteractiveMessage.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        featureId: 'app-app-123',
        content: 'add dark mode',
        worktreePath: '/repos/todo',
        model: 'claude-sonnet-4-6',
        agentType: 'claude-code',
      })
    );
    expect(result.message.kind).toBe(WhatsAppMessageKind.ReplyForwardedToSession);
  });

  it('returns UnknownCommand for an empty reply', async () => {
    const result = await env.useCase.execute({ mapping: appMapping(), text: '   ' });
    expect(result.message.kind).toBe(WhatsAppMessageKind.UnknownCommand);
    expect(env.sendInteractiveMessage.execute).not.toHaveBeenCalled();
  });

  it('deactivates the mapping and reports NoActiveThread when the app is gone', async () => {
    env = setup(null);
    const result = await env.useCase.execute({ mapping: appMapping(), text: 'hello' });

    expect(env.threadMappings.deactivate).toHaveBeenCalledWith('thread-1');
    expect(result.message.kind).toBe(WhatsAppMessageKind.NoActiveThread);
  });

  it('returns an Error outcome when forwarding throws', async () => {
    env.sendInteractiveMessage.execute.mockRejectedValueOnce(new Error('session boot failed'));
    const result = await env.useCase.execute({ mapping: appMapping(), text: 'hi' });
    expect(result.message.kind).toBe(WhatsAppMessageKind.Error);
    expect(result.message.params?.detail).toBe('session boot failed');
  });

  it('omits model/agentType when the application has none', async () => {
    env = setup({ id: 'app-123', repositoryPath: '/repos/todo' });
    await env.useCase.execute({ mapping: appMapping(), text: 'hi' });
    const arg = env.sendInteractiveMessage.execute.mock.calls[0][0];
    expect(arg.model).toBeUndefined();
    expect(arg.agentType).toBeUndefined();
  });

  describe('feature-bound HITL routing', () => {
    it('approves the latest run when the reply is affirmative', async () => {
      const result = await env.useCase.execute({ mapping: featureMapping(), text: 'yes' });
      expect(env.agentRunRepo.findLatestByFeatureId).toHaveBeenCalledWith('feat-1');
      expect(env.approveAgentRun.execute).toHaveBeenCalledWith('run-1');
      expect(env.rejectAgentRun.execute).not.toHaveBeenCalled();
      expect(result.message.kind).toBe(WhatsAppMessageKind.ApprovalAccepted);
    });

    it('approves on a Hebrew affirmative', async () => {
      const result = await env.useCase.execute({ mapping: featureMapping(), text: 'כן' });
      expect(env.approveAgentRun.execute).toHaveBeenCalledWith('run-1');
      expect(result.message.kind).toBe(WhatsAppMessageKind.ApprovalAccepted);
    });

    it('rejects the latest run when the reply is negative, passing the text as feedback', async () => {
      const result = await env.useCase.execute({ mapping: featureMapping(), text: 'no' });
      expect(env.rejectAgentRun.execute).toHaveBeenCalledWith('run-1', 'no');
      expect(env.approveAgentRun.execute).not.toHaveBeenCalled();
      expect(result.message.kind).toBe(WhatsAppMessageKind.ApprovalRejected);
    });

    it('treats ambiguous free-text as UnknownCommand (never a silent approval)', async () => {
      const result = await env.useCase.execute({
        mapping: featureMapping(),
        text: 'maybe do it differently',
      });
      expect(env.approveAgentRun.execute).not.toHaveBeenCalled();
      expect(env.rejectAgentRun.execute).not.toHaveBeenCalled();
      expect(result.message.kind).toBe(WhatsAppMessageKind.UnknownCommand);
    });

    it('reports NoActiveThread when the feature has no agent run', async () => {
      env = setup(null, { run: null });
      const result = await env.useCase.execute({ mapping: featureMapping(), text: 'yes' });
      expect(result.message.kind).toBe(WhatsAppMessageKind.NoActiveThread);
    });

    it('surfaces an Error when approval is not applicable', async () => {
      env.approveAgentRun.execute.mockResolvedValueOnce({
        approved: false,
        reason: 'no gate open',
      });
      const result = await env.useCase.execute({ mapping: featureMapping(), text: 'approve' });
      expect(result.message.kind).toBe(WhatsAppMessageKind.Error);
      expect(result.message.params?.detail).toBe('no gate open');
    });
  });
});
