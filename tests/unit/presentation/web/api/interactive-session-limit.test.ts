// @vitest-environment node

/**
 * API Route Tests: concurrent-session cap on the interactive chat routes.
 *
 * Hitting the session cap is expected and user-actionable, so both routes
 * that can start a session must answer 429 — not 500.
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

const LIMIT_MESSAGE =
  'Cannot start a new session: 3 of 3 allowed concurrent sessions are active. Stop an existing session first.';

function sessionLimitError(): Error {
  return Object.assign(new Error(LIMIT_MESSAGE), { code: 'CONCURRENT_SESSION_LIMIT' });
}

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('concurrent-session cap on the chat routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockExecute.mockRejectedValue(sessionLimitError());
  });

  // The old check searched the message for "concurrent session limit", a
  // phrase the error's message never contains, so this returned 500.
  it('POST /api/interactive/chat/:featureId/messages returns 429', async () => {
    const route = await import(
      '../../../../../src/presentation/web/app/api/interactive/chat/[featureId]/messages/route.js'
    );

    const res = await route.POST(post({ content: 'hi' }), {
      params: Promise.resolve({ featureId: 'app-1' }),
    });

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      error: LIMIT_MESSAGE,
      code: 'CONCURRENT_SESSION_LIMIT',
    });
  });

  // `instanceof ConcurrentSessionLimitError` never matches across bundles.
  it('POST /api/interactive/sessions returns 429', async () => {
    const route = await import(
      '../../../../../src/presentation/web/app/api/interactive/sessions/route.js'
    );

    const res = await route.POST(post({ featureId: 'f', worktreePath: '/wt' }));

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toMatchObject({ code: 'CONCURRENT_SESSION_LIMIT' });
  });
});
