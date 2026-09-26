// @vitest-environment node

/**
 * API Route Tests: interactive chat error mapping
 *
 * Starting a chat fails in an expected, user-actionable way when the agent
 * has no interactive mode. That must reach the client as a 422 carrying a
 * stable `code`, not a 500.
 *
 * The routes are bundled separately from the DI container, so the error they
 * catch is never `instanceof` the domain class (see `lib/error-code.ts`). The
 * use-case doubles below therefore throw plain errors carrying only `code`,
 * exactly as the routes see them in production.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockExecute = vi.fn();

vi.mock('@/lib/server-container', () => ({
  resolve: vi.fn(() => ({ execute: mockExecute })),
}));

vi.mock('@shepai/core/infrastructure/services/filesystem/shep-directory.service', () => ({
  getShepHomeDir: () => '/tmp/shep-home',
}));

function codedError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function post(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/interactive/chat/:featureId/messages', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let route: typeof import('@/app/api/interactive/chat/[featureId]/messages/route');
  const params = { params: Promise.resolve({ featureId: 'app-1' }) };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    route = await import(
      '../../../../../src/presentation/web/app/api/interactive/chat/[featureId]/messages/route.js'
    );
  });

  it('returns 422 with the agent message when the agent has no interactive mode', async () => {
    mockExecute.mockRejectedValue(
      codedError(
        'INTERACTIVE_AGENT_UNSUPPORTED',
        'Gemini CLI does not support chat sessions yet. Choose an agent that does in Settings, then send your message again.'
      )
    );

    const res = await route.POST(post('http://localhost/x', { content: 'hi' }), params);

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({
      error:
        'Gemini CLI does not support chat sessions yet. Choose an agent that does in Settings, then send your message again.',
      code: 'INTERACTIVE_AGENT_UNSUPPORTED',
    });
  });

  it('still returns 500 for an unexpected failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mockExecute.mockRejectedValue(new Error('boom'));

    const res = await route.POST(post('http://localhost/x', { content: 'hi' }), params);

    expect(res.status).toBe(500);
  });
});

describe('POST /api/interactive/sessions', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let route: typeof import('@/app/api/interactive/sessions/route');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    route = await import(
      '../../../../../src/presentation/web/app/api/interactive/sessions/route.js'
    );
  });

  it('returns 422 when the agent has no interactive mode', async () => {
    mockExecute.mockRejectedValue(
      codedError('INTERACTIVE_AGENT_UNSUPPORTED', 'Gemini CLI does not support chat sessions yet.')
    );

    const res = await route.POST(
      post('http://localhost/x', { featureId: 'f', worktreePath: '/wt', agentType: 'gemini-cli' })
    );

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toMatchObject({ code: 'INTERACTIVE_AGENT_UNSUPPORTED' });
  });
});
