import { describe, it, expect, vi } from 'vitest';
import { LinearTrackerClient } from '@/infrastructure/services/trackers/linear-tracker.client.js';
import {
  TrackerAuthError,
  TrackerRateLimitError,
  TrackerStatusUnavailableError,
} from '@/application/ports/output/services/tracker-client.interface.js';
import { Priority, StateGroup } from '@/domain/generated/output.js';

type Fetch = typeof fetch;

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function bodyOf(
  fetchFn: ReturnType<typeof vi.fn>,
  call = 0
): { query: string; variables: Record<string, unknown> } {
  return JSON.parse((fetchFn.mock.calls[call][1] as RequestInit).body as string);
}

const ISSUE = {
  id: 'uuid-42',
  identifier: 'ENG-42',
  url: 'https://linear.app/acme/issue/ENG-42',
  title: 'Fix refunds',
  description: 'Steps\n\n- a',
  priority: 2,
  updatedAt: '2026-10-01T10:00:00.000Z',
  state: { name: 'In Progress', type: 'started' },
};

describe('LinearTrackerClient', () => {
  it('authenticates with the API key and names the account', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(json({ data: { viewer: { name: 'Ada', email: 'a@x' } } }));
    const client = new LinearTrackerClient('lin_api_key', fetchFn as unknown as Fetch);

    expect(await client.testConnection()).toEqual({ name: 'Ada' });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.linear.app/graphql');
    expect((init.headers as Record<string, string>).Authorization).toBe('lin_api_key');
  });

  it('maps issues of a team updated since the cursor and pages on', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      json({
        data: {
          issues: { nodes: [ISSUE], pageInfo: { hasNextPage: true, endCursor: 'c-2' } },
        },
      })
    );
    const client = new LinearTrackerClient('k', fetchFn as unknown as Fetch);
    const since = new Date('2026-09-30T00:00:00Z');

    const page = await client.searchUpdatedSince('ENG', since, 'c-1');

    expect(page).toEqual({
      issues: [
        {
          externalId: 'uuid-42',
          key: 'ENG-42',
          url: 'https://linear.app/acme/issue/ENG-42',
          title: 'Fix refunds',
          description: 'Steps\n\n- a',
          stateGroup: StateGroup.Started,
          stateName: 'In Progress',
          priority: Priority.High,
          updatedAt: new Date('2026-10-01T10:00:00.000Z'),
        },
      ],
      nextPage: 'c-2',
    });
    const { variables } = bodyOf(fetchFn);
    expect(variables).toEqual({
      after: 'c-1',
      filter: { team: { key: { eq: 'ENG' } }, updatedAt: { gt: '2026-09-30T00:00:00.000Z' } },
    });
  });

  it('has no next page on the last page and no updatedAt filter without a cursor', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        json({ data: { issues: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } })
      );
    const page = await new LinearTrackerClient('k', fetchFn as unknown as Fetch).searchUpdatedSince(
      'ENG',
      undefined
    );
    expect(page).toEqual({ issues: [] });
    expect(bodyOf(fetchFn).variables.filter).toEqual({ team: { key: { eq: 'ENG' } } });
  });

  it('updates fields and moves the issue to the first workflow state of the group', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          data: {
            workflowStates: {
              nodes: [
                { id: 'st-review', type: 'completed', position: 5 },
                { id: 'st-done', type: 'completed', position: 2 },
              ],
            },
          },
        })
      )
      .mockResolvedValueOnce(json({ data: { issueUpdate: { success: true } } }));
    const client = new LinearTrackerClient('k', fetchFn as unknown as Fetch);

    await client.updateIssue('ENG', 'uuid-42', {
      title: 'New title',
      stateGroup: StateGroup.Completed,
      priority: Priority.Urgent,
    });

    expect(bodyOf(fetchFn, 0).variables).toEqual({ team: 'ENG', type: 'completed' });
    expect(bodyOf(fetchFn, 1).variables).toEqual({
      id: 'uuid-42',
      input: { title: 'New title', priority: 1, stateId: 'st-done' },
    });
  });

  it('reports a status group the team has no state for', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ data: { workflowStates: { nodes: [] } } }));
    await expect(
      new LinearTrackerClient('k', fetchFn as unknown as Fetch).updateIssue('ENG', 'id', {
        stateGroup: StateGroup.Backlog,
      })
    ).rejects.toBeInstanceOf(TrackerStatusUnavailableError);
  });

  it('turns HTTP 401 into an auth error', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        json({ errors: [{ message: 'Authentication required' }] }, { status: 401 })
      );
    await expect(
      new LinearTrackerClient('bad', fetchFn as unknown as Fetch).testConnection()
    ).rejects.toBeInstanceOf(TrackerAuthError);
  });

  it('turns RATELIMITED into a rate-limit error with the reset delay', async () => {
    const reset = Date.now() + 30_000;
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        json(
          { errors: [{ message: 'Rate limit exceeded', extensions: { code: 'RATELIMITED' } }] },
          { status: 400, headers: { 'x-ratelimit-requests-reset': String(reset) } }
        )
      );
    const error = await new LinearTrackerClient('k', fetchFn as unknown as Fetch)
      .testConnection()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TrackerRateLimitError);
    expect((error as TrackerRateLimitError).retryAfterMs).toBeGreaterThan(20_000);
  });

  it('surfaces GraphQL errors on a 200 response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ errors: [{ message: 'Team not found' }] }));
    await expect(
      new LinearTrackerClient('k', fetchFn as unknown as Fetch).searchUpdatedSince(
        'NOPE',
        undefined
      )
    ).rejects.toThrow('Team not found');
  });
});
