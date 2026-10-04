/**
 * NotionKnowledgeClient (spec 125) against a fake Notion API: the requests it
 * makes, how it walks page trees and databases across pages of results, and
 * how failures map to connection errors.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  MAX_PAGE_TREE_DEPTH,
  NotionKnowledgeClient,
  parseNotionId,
} from '@/infrastructure/services/knowledge/notion-knowledge.client.js';
import {
  ConnectionAuthError,
  ConnectionRateLimitError,
  ConnectionRequestError,
} from '@/application/ports/output/services/connection-errors.js';
import { KnowledgeScopeKind } from '@/domain/generated/output.js';

const ROOT = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d';
const ROOT_ID = '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d';

type Route = (
  url: URL,
  init: RequestInit
) => { status?: number; body?: unknown; headers?: Record<string, string> };

function fakeFetch(route: Route) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const { status = 200, body, headers = {} } = route(url, init ?? {});
    return new Response(body === undefined ? '' : JSON.stringify(body), { status, headers });
  });
}

const rt = (text: string) => [
  {
    type: 'text',
    plain_text: text,
    href: null,
    annotations: { bold: false, italic: false, strikethrough: false, code: false },
  },
];

function page(id: string, title: string, edited = '2026-10-01T10:00:00.000Z') {
  return {
    object: 'page',
    id,
    url: `https://www.notion.so/${id.replace(/-/g, '')}`,
    last_edited_time: edited,
    properties: {
      Name: { type: 'title', title: rt(title) },
      Owner: { type: 'people', people: [] },
    },
  };
}

describe('parseNotionId', () => {
  it('accepts ids, dashed ids and links', () => {
    expect(parseNotionId(ROOT)).toBe(ROOT_ID);
    expect(parseNotionId(ROOT_ID)).toBe(ROOT_ID);
    expect(parseNotionId(`https://www.notion.so/acme/Payments-PRDs-${ROOT}?pvs=4`)).toBe(ROOT_ID);
    expect(parseNotionId('not a page')).toBeUndefined();
  });
});

describe('NotionKnowledgeClient', () => {
  it('names the workspace and sends the token and API version', async () => {
    const fetchFn = fakeFetch(() => ({
      body: { object: 'user', name: 'shep', bot: { workspace_name: 'Acme' } },
    }));
    expect(await new NotionKnowledgeClient('secret_x', fetchFn).verify()).toEqual({ name: 'Acme' });
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe('https://api.notion.com/v1/users/me');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer secret_x');
    expect(new Headers(init?.headers).get('notion-version')).toBe('2022-06-28');
  });

  it('maps rejected tokens, rate limits and unshared pages to connection errors', async () => {
    const rejected = fakeFetch(() => ({ status: 401, body: { message: 'API token is invalid.' } }));
    await expect(new NotionKnowledgeClient('x', rejected).verify()).rejects.toBeInstanceOf(
      ConnectionAuthError
    );
    const limited = fakeFetch(() => ({
      status: 429,
      body: { message: 'slow down' },
      headers: { 'retry-after': '3' },
    }));
    await expect(new NotionKnowledgeClient('x', limited).verify()).rejects.toMatchObject({
      retryAfterMs: 3000,
    });
    await expect(new NotionKnowledgeClient('x', limited).verify()).rejects.toBeInstanceOf(
      ConnectionRateLimitError
    );
    const missing = fakeFetch(() => ({ status: 404, body: { message: 'Could not find' } }));
    await expect(new NotionKnowledgeClient('x', missing).describeScope(ROOT)).rejects.toThrow(
      /not found, or not shared with the integration/
    );
    await expect(
      new NotionKnowledgeClient('x', missing).describeScope('nope')
    ).rejects.toBeInstanceOf(ConnectionRequestError);
  });

  it('describes a database, else a page', async () => {
    const asDatabase = fakeFetch((url) =>
      url.pathname.startsWith('/v1/databases/')
        ? { body: { object: 'database', id: ROOT_ID, title: rt('Incidents') } }
        : { status: 404, body: {} }
    );
    expect(await new NotionKnowledgeClient('x', asDatabase).describeScope(ROOT)).toEqual({
      id: ROOT_ID,
      kind: KnowledgeScopeKind.Database,
      title: 'Incidents',
    });
    const asPage = fakeFetch((url) =>
      url.pathname.startsWith('/v1/pages/')
        ? { body: page(ROOT_ID, 'Payments PRDs') }
        : { status: 404, body: {} }
    );
    expect(await new NotionKnowledgeClient('x', asPage).describeScope(ROOT)).toEqual({
      id: ROOT_ID,
      kind: KnowledgeScopeKind.Page,
      title: 'Payments PRDs',
    });
  });

  it('lists a database across result pages', async () => {
    const fetchFn = fakeFetch((url, init) => {
      const body = JSON.parse(String(init.body ?? '{}')) as { start_cursor?: string };
      return body.start_cursor
        ? { body: { results: [page('p-2', 'Two')], has_more: false, next_cursor: null } }
        : { body: { results: [page('p-1', 'One')], has_more: true, next_cursor: 'c2' } };
    });
    const pages = await new NotionKnowledgeClient('x', fetchFn).listPages({
      id: ROOT_ID,
      kind: KnowledgeScopeKind.Database,
      title: 'DB',
    });
    expect(pages.map((p) => [p.pageId, p.title])).toEqual([
      ['p-1', 'One'],
      ['p-2', 'Two'],
    ]);
    expect(pages[0].editedAt).toEqual(new Date('2026-10-01T10:00:00.000Z'));
    expect(String(fetchFn.mock.calls[0][0])).toBe(
      `https://api.notion.com/v1/databases/${ROOT_ID}/query`
    );
    expect(fetchFn.mock.calls[0][1]?.method).toBe('POST');
  });

  it('walks a page tree, including pages inside other blocks, across result pages', async () => {
    const children: Record<
      string,
      { results: unknown[]; has_more: boolean; next_cursor: string | null }[]
    > = {
      [ROOT_ID]: [
        {
          results: [
            {
              id: 'b-1',
              type: 'paragraph',
              has_children: false,
              paragraph: { rich_text: rt('hi') },
            },
            {
              id: 'child-a',
              type: 'child_page',
              has_children: true,
              last_edited_time: '2026-10-02T00:00:00.000Z',
              child_page: { title: 'Runbook' },
            },
          ],
          has_more: true,
          next_cursor: 'n1',
        },
        {
          results: [
            {
              id: 'toggle-1',
              type: 'toggle',
              has_children: true,
              toggle: { rich_text: rt('More') },
            },
          ],
          has_more: false,
          next_cursor: null,
        },
      ],
      'child-a': [{ results: [], has_more: false, next_cursor: null }],
      'toggle-1': [
        {
          results: [
            {
              id: 'child-b',
              type: 'child_page',
              has_children: false,
              last_edited_time: '2026-10-03T00:00:00.000Z',
              child_page: { title: 'Pricing' },
            },
          ],
          has_more: false,
          next_cursor: null,
        },
      ],
    };
    const fetchFn = fakeFetch((url) => {
      if (url.pathname === `/v1/pages/${ROOT_ID}`) return { body: page(ROOT_ID, 'Root') };
      const id = url.pathname.split('/')[3];
      const cursor = url.searchParams.get('start_cursor');
      return { body: children[id][cursor ? 1 : 0] };
    });
    const pages = await new NotionKnowledgeClient('x', fetchFn).listPages({
      id: ROOT_ID,
      kind: KnowledgeScopeKind.Page,
      title: 'Root',
    });
    expect(pages.map((p) => [p.pageId, p.title, p.url])).toEqual([
      [ROOT_ID, 'Root', `https://www.notion.so/${ROOT}`],
      ['child-a', 'Runbook', 'https://www.notion.so/childa'],
      ['child-b', 'Pricing', 'https://www.notion.so/childb'],
    ]);
  });

  it(`stops descending after ${MAX_PAGE_TREE_DEPTH} levels`, async () => {
    const fetchFn = fakeFetch((url) => {
      if (url.pathname.startsWith('/v1/pages/')) return { body: page('d0', 'Root') };
      const id = url.pathname.split('/')[3];
      const depth = Number(id.slice(1));
      return {
        body: {
          results: [
            {
              id: `d${depth + 1}`,
              type: 'child_page',
              has_children: true,
              last_edited_time: '2026-10-01T00:00:00.000Z',
              child_page: { title: `L${depth + 1}` },
            },
          ],
          has_more: false,
          next_cursor: null,
        },
      };
    });
    const pages = await new NotionKnowledgeClient('x', fetchFn).listPages({
      id: 'd0',
      kind: KnowledgeScopeKind.Page,
      title: 'Root',
    });
    expect(pages).toHaveLength(MAX_PAGE_TREE_DEPTH + 1);
  });

  it('reads a page as Markdown with nested blocks, not descending into child pages', async () => {
    const fetchFn = fakeFetch((url) => {
      const id = url.pathname.split('/')[3];
      if (id === ROOT_ID) {
        return {
          body: {
            results: [
              {
                id: 'h',
                type: 'heading_1',
                has_children: false,
                heading_1: { rich_text: rt('Refunds') },
              },
              {
                id: 'l',
                type: 'bulleted_list_item',
                has_children: true,
                bulleted_list_item: { rich_text: rt('Guests') },
              },
              { id: 'c', type: 'child_page', has_children: true, child_page: { title: 'Runbook' } },
            ],
            has_more: false,
            next_cursor: null,
          },
        };
      }
      if (id === 'l') {
        return {
          body: {
            results: [
              {
                id: 'l2',
                type: 'bulleted_list_item',
                has_children: false,
                bulleted_list_item: { rich_text: rt('by email') },
              },
            ],
            has_more: false,
            next_cursor: null,
          },
        };
      }
      throw new Error(`unexpected ${url.pathname}`);
    });
    expect(await new NotionKnowledgeClient('x', fetchFn).readPage(ROOT_ID)).toBe(
      '# Refunds\n\n- Guests\n  - by email\n\n[page: Runbook]'
    );
  });
});
