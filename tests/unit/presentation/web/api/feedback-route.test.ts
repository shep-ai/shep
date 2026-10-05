// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntakeRejection } from '@shepai/core/domain/generated/output';

const ingest = { execute: vi.fn() };
vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    if (token !== 'IngestFeedbackUseCase') throw new Error(`Unknown token: ${token}`);
    return ingest;
  },
}));

const { MAX_INTAKE_BYTES: MAX_FEEDBACK_BYTES } = await import(
  '../../../../../src/presentation/web/lib/intake-route.js'
);
const { POST } = await import('../../../../../src/presentation/web/app/api/feedback/route.js');

function post(body: string, key = 'shep_fb_secret'): Request {
  return new Request('http://localhost/api/feedback', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body,
  });
}

describe('POST /api/feedback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records feedback with the bearer key and answers 201', async () => {
    ingest.execute.mockResolvedValue({ ok: true, signal: { id: 'sig-1' }, duplicate: false });
    const response = await POST(post(JSON.stringify({ text: 'Export to CSV', externalId: 't-1' })));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'sig-1', duplicate: false });
    expect(ingest.execute).toHaveBeenCalledWith('shep_fb_secret', {
      text: 'Export to CSV',
      externalId: 't-1',
    });
  });

  it('answers 200 for a repeat of the same external id', async () => {
    ingest.execute.mockResolvedValue({ ok: true, signal: { id: 'sig-1' }, duplicate: true });
    expect((await POST(post('{"text":"x","externalId":"t-1"}'))).status).toBe(200);
  });

  it('answers 401 for a bad key and 400 for a bad payload, never echoing the key', async () => {
    ingest.execute.mockResolvedValue({
      ok: false,
      rejection: IntakeRejection.Unauthorized,
      error: 'Unknown or revoked feedback key.',
    });
    const unauthorized = await POST(post('{"text":"x"}', 'shep_fb_wrong'));
    expect(unauthorized.status).toBe(401);
    expect(JSON.stringify(await unauthorized.json())).not.toContain('shep_fb_wrong');

    ingest.execute.mockResolvedValue({
      ok: false,
      rejection: IntakeRejection.Invalid,
      error: '"text" is required.',
    });
    expect((await POST(post('{}'))).status).toBe(400);
  });

  it('refuses non-JSON and oversized bodies without calling the use case', async () => {
    expect((await POST(post('not json'))).status).toBe(400);
    expect((await POST(post('[1,2]'))).status).toBe(400);
    expect((await POST(post('x'.repeat(MAX_FEEDBACK_BYTES + 1)))).status).toBe(413);
    expect(ingest.execute).not.toHaveBeenCalled();
  });
});
