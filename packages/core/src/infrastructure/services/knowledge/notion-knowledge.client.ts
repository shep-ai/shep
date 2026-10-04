/**
 * Notion knowledge client (spec 125): REST API v1 over an injected fetch,
 * with an internal integration token. Pages are visible to the integration
 * only once shared with it in Notion.
 *
 * - verify: GET /users/me (the bot's workspace name)
 * - describeScope: GET /databases/{id}, else GET /pages/{id}
 * - listPages: POST /databases/{id}/query, or a walk of GET /blocks/{id}/children
 *   collecting child pages (also inside toggles, columns and other blocks)
 * - readPage: the page's blocks, children attached, as Markdown
 */

import { KnowledgeScopeKind } from '../../../domain/generated/output.js';
import { MAX_KNOWLEDGE_PAGES_PER_SOURCE } from '../../../domain/shared/knowledge.js';
import type { ConnectionAccount } from '../../../application/ports/output/services/connection-verifier.interface.js';
import type {
  IKnowledgeClient,
  KnowledgePageRef,
  KnowledgeScope,
} from '../../../application/ports/output/services/knowledge-client.interface.js';
import { ConnectionRequestError } from '../../../application/ports/output/services/connection-errors.js';
import { httpFailure, sendJson, type FetchFunction } from '../connections/connection-http.js';
import { notionBlocksToMarkdown, richTextToMarkdown, type NotionBlock } from './notion-blocks.js';

const API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const PAGE_SIZE = 100;
const HTTP_NOT_FOUND = 404;
const LABEL = 'Notion';
const PAGE_URL = 'https://www.notion.so/';
const UNTITLED = 'Untitled';

/** How many levels of pages under a scope page are read. */
export const MAX_PAGE_TREE_DEPTH = 5;

/** Blocks whose children are other pages' content, not this page's. */
const PAGE_BOUNDARIES = new Set(['child_page', 'child_database']);

const NOTION_ID =
  /([0-9a-f]{32})(?:[^0-9a-f]|$)|([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** The dashed id in a Notion id or link, or undefined when there is none. */
export function parseNotionId(ref: string): string | undefined {
  const match = NOTION_ID.exec(ref.trim());
  if (!match) return undefined;
  const hex = (match[1] ?? match[2]).replace(/-/g, '').toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface NotionPage {
  id: string;
  url?: string;
  last_edited_time: string;
  properties?: Record<string, { type: string; title?: Parameters<typeof richTextToMarkdown>[0] }>;
}

interface NotionList<T> {
  results: T[];
  has_more: boolean;
  next_cursor: string | null;
}

interface ChildPageBlock extends NotionBlock {
  last_edited_time?: string;
  child_page?: { title?: string };
}

/** A title, or "Untitled" when it is blank. */
function titled(text: string | undefined): string {
  const trimmed = (text ?? '').trim();
  return trimmed === '' ? UNTITLED : trimmed;
}

function pageTitle(page: NotionPage): string {
  const title = Object.values(page.properties ?? {}).find((property) => property.type === 'title');
  return titled(richTextToMarkdown(title?.title));
}

function pageUrl(id: string): string {
  return `${PAGE_URL}${id.replace(/-/g, '')}`;
}

export class NotionKnowledgeClient implements IKnowledgeClient {
  constructor(
    private readonly token: string,
    private readonly fetchFn: FetchFunction = fetch
  ) {}

  async verify(): Promise<ConnectionAccount> {
    const me = await this.request<{ name?: string; bot?: { workspace_name?: string } }>(
      'GET',
      '/users/me'
    );
    return { name: me.bot?.workspace_name ?? me.name ?? LABEL };
  }

  async describeScope(scopeRef: string): Promise<KnowledgeScope> {
    const id = parseNotionId(scopeRef);
    if (!id)
      throw new ConnectionRequestError(`"${scopeRef}" is not a Notion page or database link.`);
    const database = await this.optional<{ title?: Parameters<typeof richTextToMarkdown>[0] }>(
      `/databases/${id}`
    );
    if (database) {
      return {
        id,
        kind: KnowledgeScopeKind.Database,
        title: titled(richTextToMarkdown(database.title)),
      };
    }
    const page = await this.optional<NotionPage>(`/pages/${id}`);
    if (page) return { id, kind: KnowledgeScopeKind.Page, title: pageTitle(page) };
    throw new ConnectionRequestError(
      `${LABEL}: page or database ${id} was not found, or not shared with the integration.`,
      HTTP_NOT_FOUND
    );
  }

  async listPages(scope: KnowledgeScope): Promise<KnowledgePageRef[]> {
    if (scope.kind === KnowledgeScopeKind.Database) return this.listDatabase(scope.id);
    const root = await this.request<NotionPage>('GET', `/pages/${scope.id}`);
    const pages: KnowledgePageRef[] = [
      {
        pageId: scope.id,
        title: pageTitle(root),
        url: root.url ?? pageUrl(scope.id),
        editedAt: new Date(root.last_edited_time),
      },
    ];
    await this.walk(scope.id, 0, pages);
    return pages;
  }

  async readPage(pageId: string): Promise<string> {
    return notionBlocksToMarkdown(await this.blocks(pageId));
  }

  private async listDatabase(id: string): Promise<KnowledgePageRef[]> {
    const pages: KnowledgePageRef[] = [];
    let cursor: string | undefined;
    do {
      const list = await this.request<NotionList<NotionPage>>('POST', `/databases/${id}/query`, {
        page_size: PAGE_SIZE,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      for (const page of list.results) {
        pages.push({
          pageId: page.id,
          title: pageTitle(page),
          url: page.url ?? pageUrl(page.id),
          editedAt: new Date(page.last_edited_time),
        });
      }
      cursor = list.has_more && list.next_cursor ? list.next_cursor : undefined;
    } while (cursor && pages.length < MAX_KNOWLEDGE_PAGES_PER_SOURCE);
    return pages.slice(0, MAX_KNOWLEDGE_PAGES_PER_SOURCE);
  }

  /** Collects child pages under a block, depth counting page levels only. */
  private async walk(blockId: string, depth: number, pages: KnowledgePageRef[]): Promise<void> {
    for (const child of await this.children(blockId)) {
      if (pages.length >= MAX_KNOWLEDGE_PAGES_PER_SOURCE) return;
      const block = child as ChildPageBlock;
      if (block.type === 'child_page') {
        pages.push({
          pageId: block.id,
          title: titled(block.child_page?.title),
          url: pageUrl(block.id),
          editedAt: new Date(block.last_edited_time ?? 0),
        });
        if (depth + 1 < MAX_PAGE_TREE_DEPTH && block.has_children) {
          await this.walk(block.id, depth + 1, pages);
        }
      } else if (block.has_children && !PAGE_BOUNDARIES.has(block.type)) {
        await this.walk(block.id, depth, pages);
      }
    }
  }

  /** A block's children with their own children attached, stopping at other pages. */
  private async blocks(blockId: string): Promise<NotionBlock[]> {
    const children = await this.children(blockId);
    for (const child of children) {
      if (child.has_children && !PAGE_BOUNDARIES.has(child.type)) {
        child.children = await this.blocks(child.id);
      }
    }
    return children;
  }

  private async children(blockId: string): Promise<NotionBlock[]> {
    const blocks: NotionBlock[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ page_size: String(PAGE_SIZE) });
      if (cursor) query.set('start_cursor', cursor);
      const list = await this.request<NotionList<NotionBlock>>(
        'GET',
        `/blocks/${blockId}/children?${query.toString()}`
      );
      blocks.push(...list.results);
      cursor = list.has_more && list.next_cursor ? list.next_cursor : undefined;
    } while (cursor);
    return blocks;
  }

  /** A GET that returns undefined on 404. */
  private async optional<T>(path: string): Promise<T | undefined> {
    try {
      return await this.request<T>('GET', path);
    } catch (error) {
      if (error instanceof ConnectionRequestError && error.status === HTTP_NOT_FOUND) {
        return undefined;
      }
      throw error;
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const { response, body: parsed } = await sendJson(this.fetchFn, `${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const detail = (parsed as { message?: string } | undefined)?.message ?? '';
      throw httpFailure(LABEL, response, detail);
    }
    return parsed as T;
  }
}
