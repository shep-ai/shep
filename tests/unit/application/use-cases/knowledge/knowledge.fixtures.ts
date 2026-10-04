/** Shared fakes for the knowledge use-case tests (spec 125). */

import { vi } from 'vitest';
import {
  ConnectionProvider,
  ConnectionStatus,
  KnowledgeScopeKind,
  type Connection,
  type KnowledgeSource,
} from '@/domain/generated/output.js';
import type {
  IKnowledgeClient,
  IKnowledgeClientFactory,
  KnowledgePageRef,
} from '@/application/ports/output/services/knowledge-client.interface.js';

export const T0 = new Date('2026-10-05T10:00:00Z');
export const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

export const NOTION: Connection = {
  id: 'conn-notion',
  provider: ConnectionProvider.Notion,
  name: 'Acme Notion',
  slug: 'acme-notion',
  spaceId: 'space-acme',
  accountName: 'Acme',
  status: ConnectionStatus.Connected,
  createdAt: T0,
  updatedAt: T0,
};

export const LINEAR: Connection = {
  ...NOTION,
  id: 'conn-linear',
  provider: ConnectionProvider.Linear,
  name: 'Linear',
  slug: 'linear',
};

export const SOURCE: KnowledgeSource = {
  id: 'src-1',
  connectionId: NOTION.id,
  spaceId: 'space-acme',
  scopeId: 'root',
  scopeKind: KnowledgeScopeKind.Page,
  scopeTitle: 'Payments PRDs',
  intervalMinutes: 60,
  enabled: true,
  createdAt: T0,
  updatedAt: T0,
};

export function pageRef(pageId: string, editedMinutes = 0, title = pageId): KnowledgePageRef {
  return { pageId, title, url: `https://notion.so/${pageId}`, editedAt: at(editedMinutes) };
}

/** A Notion workspace whose pages and contents the test sets. */
export class FakeKnowledgeClient implements IKnowledgeClient {
  pages: KnowledgePageRef[] = [];
  contents = new Map<string, string>();
  reads: string[] = [];
  verify = vi.fn(async () => ({ name: 'Acme' }));
  describeScope = vi.fn(async (ref: string) => ({
    id: ref === 'https://notion.so/db' ? 'db' : 'root',
    kind: ref === 'https://notion.so/db' ? KnowledgeScopeKind.Database : KnowledgeScopeKind.Page,
    title: 'Payments PRDs',
  }));
  listPages = vi.fn(async () => this.pages);
  readPage = vi.fn(async (pageId: string) => {
    this.reads.push(pageId);
    const content = this.contents.get(pageId);
    if (content === undefined) throw new Error(`no page ${pageId}`);
    return content;
  });
}

export function fakeFactory(client: FakeKnowledgeClient): IKnowledgeClientFactory & {
  create: ReturnType<typeof vi.fn>;
} {
  return { create: vi.fn(() => client) };
}
