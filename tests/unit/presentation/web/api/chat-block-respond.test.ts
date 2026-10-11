// @vitest-environment node

/**
 * API Route: answering a chat block (spec 137).
 *
 * The use-case double throws plain errors carrying only `code`, exactly as the
 * route sees domain errors across the bundle boundary (see lib/error-code.ts).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockExecute = vi.fn();
const mockResolve = vi.fn((_token: string) => ({ execute: mockExecute }));

vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => mockResolve(token),
}));

vi.mock('@shepai/core/infrastructure/services/filesystem/shep-directory.service', () => ({
  getShepHomeDir: () => '/tmp/shep-home',
}));

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/interactive/chat/repo-r1/blocks/b1/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/interactive/chat/:featureId/blocks/:blockId/respond', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let route: typeof import('@/app/api/interactive/chat/[featureId]/blocks/[blockId]/respond/route');
  const params = { params: Promise.resolve({ featureId: 'repo-r1', blockId: 'b1' }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    route = await import(
      '../../../../../src/presentation/web/app/api/interactive/chat/[featureId]/blocks/[blockId]/respond/route.js'
    );
  });

  it('answers the block through the use case and returns the stored response message', async () => {
    mockExecute.mockResolvedValue({ response: {}, message: { id: 'm1' } });

    const res = await route.POST(
      post({ action: 'request_changes', note: 'Add SSO', worktreePath: '/code/cli' }),
      params
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ message: { id: 'm1' } });
    expect(mockResolve).toHaveBeenCalledWith('RespondToChatBlockUseCase');
    expect(mockExecute).toHaveBeenCalledWith({
      scope: 'repo-r1',
      blockId: 'b1',
      action: 'request_changes',
      note: 'Add SSO',
      worktreePath: '/code/cli',
    });
  });

  it('runs the agent in SHEP_HOME when no directory is given (the Shep-wide chat)', async () => {
    mockExecute.mockResolvedValue({ response: {}, message: { id: 'm1' } });
    await route.POST(post({ action: 'approve' }), params);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ worktreePath: '/tmp/shep-home' })
    );
  });

  it('rejects a body without an action', async () => {
    const res = await route.POST(post({ note: 'x' }), params);
    expect(res.status).toBe(400);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it.each([
    ['INVALID_CHAT_BLOCK', 400],
    ['CHAT_BLOCK_NOT_FOUND', 404],
    ['CHAT_BLOCK_ALREADY_ANSWERED', 409],
    ['INTERACTIVE_AGENT_UNSUPPORTED', 422],
    ['CONCURRENT_SESSION_LIMIT', 429],
  ])('maps %s to %i with the message', async (code, status) => {
    mockExecute.mockRejectedValue(codedError(code, 'explained'));
    const res = await route.POST(post({ action: 'approve' }), params);
    expect(res.status).toBe(status);
    expect(await res.json()).toEqual({ error: 'explained', code });
  });

  it('answers 500 for anything else', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockExecute.mockRejectedValue(new Error('disk full'));
    const res = await route.POST(post({ action: 'approve' }), params);
    expect(res.status).toBe(500);
  });
});
