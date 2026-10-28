// @vitest-environment node

/**
 * Web routes over the agent-activity use cases (spec 149): the snapshot the
 * activity page and drawer card read, and the wait behind "Notify me".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivityWaitOutcome, AgentActivityState } from '@shepai/core/domain/generated/output';
import { MAX_ACTIVITY_WAIT_MS } from '@shepai/core/application/use-cases/agent-activity/agent-activity.types';

const get = { execute: vi.fn() };
const wait = { execute: vi.fn() };
vi.mock('@/lib/server-container', () => ({
  resolve: (token: string) => {
    if (token === 'GetAgentActivityUseCase') return get;
    if (token === 'WaitForAgentActivityUseCase') return wait;
    throw new Error(`Unknown token: ${token}`);
  },
}));

const { GET: getActivity } = await import(
  '../../../../../src/presentation/web/app/api/agent-activity/route.js'
);
const { GET: waitForActivity } = await import(
  '../../../../../src/presentation/web/app/api/agent-activity/wait/route.js'
);

const SNAPSHOT = {
  generatedAt: new Date('2026-10-28T10:00:00Z'),
  activities: [],
  counts: { working: 0, blocked: 0, waiting: 0, done: 0, failed: 0 },
  overall: AgentActivityState.Done,
  notFound: false,
};

function request(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, init);
}

describe('GET /api/agent-activity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists active features by default', async () => {
    get.execute.mockResolvedValue(SNAPSHOT);
    const response = await getActivity(request('/api/agent-activity'));
    expect(response.status).toBe(200);
    expect(get.execute).toHaveBeenCalledWith({ includeSettled: false });
    expect(await response.json()).toMatchObject({ overall: 'done', notFound: false });
  });

  it('passes the feature, repository and settled filters through', async () => {
    get.execute.mockResolvedValue(SNAPSHOT);
    await getActivity(
      request('/api/agent-activity?featureId=abc&repositoryPath=%2Fwork%2Facme&includeSettled=1')
    );
    expect(get.execute).toHaveBeenCalledWith({
      featureId: 'abc',
      repositoryPath: '/work/acme',
      includeSettled: true,
    });
  });

  it('answers 404 with the snapshot when the feature is unknown', async () => {
    get.execute.mockResolvedValue({ ...SNAPSHOT, notFound: true });
    const response = await getActivity(request('/api/agent-activity?featureId=nope'));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ notFound: true });
  });

  it('answers 500 with the message when the read fails', async () => {
    get.execute.mockRejectedValue(new Error('database is locked'));
    const response = await getActivity(request('/api/agent-activity'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'database is locked' });
  });
});

describe('GET /api/agent-activity/wait', () => {
  beforeEach(() => vi.clearAllMocks());

  it('needs a feature id', async () => {
    const response = await waitForActivity(request('/api/agent-activity/wait'));
    expect(response.status).toBe(400);
    expect(wait.execute).not.toHaveBeenCalled();
  });

  it('refuses a state that is not an activity state', async () => {
    const response = await waitForActivity(
      request('/api/agent-activity/wait?featureId=f1&until=blocked,sleeping')
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Unknown activity state: sleeping' });
    expect(wait.execute).not.toHaveBeenCalled();
  });

  it('waits with the states, the capped timeout and the request signal', async () => {
    wait.execute.mockResolvedValue({ outcome: ActivityWaitOutcome.Matched });
    const controller = new AbortController();
    const response = await waitForActivity(
      request('/api/agent-activity/wait?featureId=f1&until=blocked,done&timeoutMs=99999999', {
        signal: controller.signal,
      })
    );
    expect(response.status).toBe(200);
    const input = wait.execute.mock.calls[0][0];
    expect(input).toMatchObject({
      featureId: 'f1',
      until: [AgentActivityState.Blocked, AgentActivityState.Done],
      timeoutMs: MAX_ACTIVITY_WAIT_MS,
    });
    expect(input.signal).toBeInstanceOf(AbortSignal);
  });

  it('defaults to the longest wait and the default states', async () => {
    wait.execute.mockResolvedValue({ outcome: ActivityWaitOutcome.TimedOut });
    const response = await waitForActivity(request('/api/agent-activity/wait?featureId=f1'));
    expect(response.status).toBe(200);
    const input = wait.execute.mock.calls[0][0];
    expect(input.timeoutMs).toBe(MAX_ACTIVITY_WAIT_MS);
    expect(input).not.toHaveProperty('until');
  });

  it('refuses a timeout that is not a positive whole number', async () => {
    const response = await waitForActivity(
      request('/api/agent-activity/wait?featureId=f1&timeoutMs=-5')
    );
    expect(response.status).toBe(400);
  });

  it('answers 404 for an unknown feature and 409 for an ambiguous prefix', async () => {
    wait.execute.mockResolvedValue({ outcome: ActivityWaitOutcome.NotFound });
    expect((await waitForActivity(request('/api/agent-activity/wait?featureId=x'))).status).toBe(
      404
    );
    wait.execute.mockResolvedValue({ outcome: ActivityWaitOutcome.Ambiguous });
    expect((await waitForActivity(request('/api/agent-activity/wait?featureId=x'))).status).toBe(
      409
    );
  });
});
