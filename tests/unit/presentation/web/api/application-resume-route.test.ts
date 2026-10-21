// @vitest-environment node

/**
 * API Route Tests: POST /api/applications/:id/resume
 *
 * The resume runs in the background after the route answers, so a rejection
 * (an unknown id, a failed step write) has no caller left. It must be logged,
 * never left as an unhandled rejection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockExecute = vi.fn();

vi.mock('@/lib/server-container', () => ({
  resolve: vi.fn(() => ({ execute: mockExecute })),
}));

describe('POST /api/applications/:id/resume', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let route: typeof import('@/app/api/applications/[id]/resume/route');
  const unhandled = vi.fn();
  const params = { params: Promise.resolve({ id: 'app-1' }) };
  const request = () =>
    new NextRequest('http://localhost/api/applications/app-1/resume', { method: 'POST' });

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.on('unhandledRejection', unhandled);
    route = await import(
      '../../../../../src/presentation/web/app/api/applications/[id]/resume/route.js'
    );
  });

  afterEach(() => {
    process.off('unhandledRejection', unhandled);
    vi.restoreAllMocks();
  });

  it('answers right away and logs a background rejection instead of leaving it unhandled', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failure = new Error('Application app-1 not found');
    mockExecute.mockRejectedValue(failure);

    const response = await route.POST(request(), params);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(response.status).toBe(200);
    expect(mockExecute).toHaveBeenCalledWith({ applicationId: 'app-1' });
    expect(unhandled).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('resume failed'), failure);
  });
});
