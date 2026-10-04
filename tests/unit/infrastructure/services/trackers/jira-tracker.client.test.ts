import { describe, it, expect, vi } from 'vitest';
import { JiraTrackerClient } from '@/infrastructure/services/trackers/jira-tracker.client.js';
import { TrackerStatusUnavailableError } from '@/application/ports/output/services/tracker-client.interface.js';
import {
  ConnectionAuthError,
  ConnectionRateLimitError,
} from '@/application/ports/output/services/connection-errors.js';
import { Priority, StateGroup } from '@/domain/generated/output.js';

type Fetch = typeof fetch;
const SITE = 'https://acme.atlassian.net';

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function call(fetchFn: ReturnType<typeof vi.fn>, index: number) {
  const [url, init] = fetchFn.mock.calls[index] as [string, RequestInit];
  return {
    url,
    method: init.method,
    body: init.body ? JSON.parse(init.body as string) : undefined,
    headers: init.headers as Record<string, string>,
  };
}

const ISSUE = {
  id: '10042',
  key: 'PAY-42',
  fields: {
    summary: 'Fix refunds',
    description: {
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Steps' }] }],
    },
    status: { name: 'In Review', statusCategory: { key: 'indeterminate' } },
    priority: { name: 'Highest' },
    updated: '2026-10-01T10:00:00.000+0000',
  },
};

function client(fetchFn: ReturnType<typeof vi.fn>, now = new Date('2026-10-01T12:00:00Z')) {
  return new JiraTrackerClient(
    { siteUrl: `${SITE}/`, accountEmail: 'me@acme.com', secret: 'token' },
    fetchFn as unknown as Fetch,
    () => now
  );
}

describe('JiraTrackerClient', () => {
  it('uses basic auth and names the account', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ displayName: 'Ada' }));
    expect(await client(fetchFn).testConnection()).toEqual({ name: 'Ada' });
    const request = call(fetchFn, 0);
    expect(request.url).toBe(`${SITE}/rest/api/3/myself`);
    expect(request.headers.Authorization).toBe(
      `Basic ${Buffer.from('me@acme.com:token').toString('base64')}`
    );
  });

  it('searches with JQL limited to issues updated since the cursor, as relative minutes', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ issues: [ISSUE], nextPageToken: 'p2' }));
    const page = await client(fetchFn).searchUpdatedSince(
      'project = PAY ORDER BY created DESC',
      new Date('2026-10-01T11:00:00Z'),
      'p1'
    );

    expect(page).toEqual({
      issues: [
        {
          externalId: '10042',
          key: 'PAY-42',
          url: `${SITE}/browse/PAY-42`,
          title: 'Fix refunds',
          description: 'Steps',
          stateGroup: StateGroup.Started,
          stateName: 'In Review',
          priority: Priority.Urgent,
          updatedAt: new Date('2026-10-01T10:00:00.000Z'),
        },
      ],
      nextPage: 'p2',
    });
    const request = call(fetchFn, 0);
    expect(request.url).toBe(`${SITE}/rest/api/3/search/jql`);
    expect(request.method).toBe('POST');
    expect(request.body).toEqual({
      jql: '(project = PAY) AND updated >= "-62m" ORDER BY updated ASC',
      fields: ['summary', 'description', 'status', 'priority', 'updated'],
      maxResults: 100,
      nextPageToken: 'p1',
    });
  });

  it('searches everything in scope without a cursor and stops on the last page', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ issues: [], isLast: true }));
    expect(await client(fetchFn).searchUpdatedSince('project = PAY', undefined)).toEqual({
      issues: [],
    });
    expect(call(fetchFn, 0).body.jql).toBe('(project = PAY) ORDER BY updated ASC');
  });

  it('writes fields with one PUT, converting the description to ADF and naming the priority', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json(undefined, { status: 204 }));
    await client(fetchFn).updateIssue('project = PAY', '10042', {
      title: 'New',
      description: 'Body',
      priority: Priority.Low,
    });
    const request = call(fetchFn, 0);
    expect(request.url).toBe(`${SITE}/rest/api/3/issue/10042`);
    expect(request.method).toBe('PUT');
    expect(request.body).toEqual({
      fields: {
        summary: 'New',
        description: {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }],
        },
        priority: { name: 'Low' },
      },
    });
  });

  it('moves status through a transition into the same group', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          transitions: [
            { id: '11', to: { name: 'In Progress', statusCategory: { key: 'indeterminate' } } },
            { id: '41', to: { name: "Won't Do", statusCategory: { key: 'done' } } },
            { id: '31', to: { name: 'Done', statusCategory: { key: 'done' } } },
          ],
        })
      )
      .mockResolvedValueOnce(json(undefined, { status: 204 }));
    await client(fetchFn).updateIssue('project = PAY', '10042', {
      stateGroup: StateGroup.Completed,
    });

    expect(call(fetchFn, 0).url).toBe(`${SITE}/rest/api/3/issue/10042/transitions`);
    expect(call(fetchFn, 1)).toMatchObject({ method: 'POST', body: { transition: { id: '31' } } });
  });

  it('reports a status group no transition reaches', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json({ transitions: [] }));
    await expect(
      client(fetchFn).updateIssue('x', '10042', { stateGroup: StateGroup.Cancelled })
    ).rejects.toBeInstanceOf(TrackerStatusUnavailableError);
  });

  it('turns 401 into an auth error and 429 into a rate-limit error with Retry-After', async () => {
    const unauthorized = vi
      .fn()
      .mockResolvedValue(json({ errorMessages: ['Unauthorized'] }, { status: 401 }));
    await expect(client(unauthorized).testConnection()).rejects.toBeInstanceOf(ConnectionAuthError);

    const limited = vi
      .fn()
      .mockResolvedValue(json({}, { status: 429, headers: { 'retry-after': '7' } }));
    const error = await client(limited)
      .testConnection()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConnectionRateLimitError);
    expect((error as ConnectionRateLimitError).retryAfterMs).toBe(7000);
  });

  it('includes Jira error messages in other failures', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        json({ errorMessages: ["The value 'NOPE' does not exist"] }, { status: 400 })
      );
    await expect(client(fetchFn).searchUpdatedSince('project = NOPE', undefined)).rejects.toThrow(
      "The value 'NOPE' does not exist"
    );
  });
});
