// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntakeRejection } from '@shepai/core/domain/generated/output';

const ingest = { execute: vi.fn() };
const flags = vi.hoisted(() => ({ value: { incidents: true } }));
vi.mock('@/lib/feature-flags', () => ({ getFeatureFlags: () => flags.value }));
vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    if (token !== 'IngestAlertUseCase') throw new Error(`Unknown token: ${token}`);
    return ingest;
  },
}));

const { POST } = await import('../../../../../src/presentation/web/app/api/alerts/route.js');

function post(body: string, key = 'shep_fb_secret'): Request {
  return new Request('http://localhost/api/alerts', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body,
  });
}

describe('POST /api/alerts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('answers 404 without reading the request while the incidents flag is off (spec 133)', async () => {
    flags.value = { incidents: false };
    const response = await POST(post('{"text":"x"}'));
    flags.value = { incidents: true };
    expect(response.status).toBe(404);
    expect(ingest.execute).not.toHaveBeenCalled();
  });

  it('opens an incident (201) and notes a repeat (200)', async () => {
    ingest.execute.mockResolvedValue({ ok: true, incident: { id: 'inc-1' }, duplicate: false });
    const created = await POST(post('{"title":"CheckoutErrorRate","externalId":"fp-1"}'));
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ id: 'inc-1', duplicate: false });
    expect(ingest.execute).toHaveBeenCalledWith('shep_fb_secret', {
      title: 'CheckoutErrorRate',
      externalId: 'fp-1',
    });
    ingest.execute.mockResolvedValue({ ok: true, incident: { id: 'inc-1' }, duplicate: true });
    expect((await POST(post('{"title":"x"}'))).status).toBe(200);
  });

  it('answers 401 for a bad key and 400 for a bad payload', async () => {
    ingest.execute.mockResolvedValue({
      ok: false,
      rejection: IntakeRejection.Unauthorized,
      error: 'Unknown or revoked intake key.',
    });
    expect((await POST(post('{"title":"x"}', 'nope'))).status).toBe(401);
    ingest.execute.mockResolvedValue({
      ok: false,
      rejection: IntakeRejection.Invalid,
      error: 'bad',
    });
    expect((await POST(post('{}'))).status).toBe(400);
    expect((await POST(post('not json'))).status).toBe(400);
  });
});
