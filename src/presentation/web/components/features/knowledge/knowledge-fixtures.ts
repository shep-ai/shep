/** Sample knowledge data for the knowledge and Connections stories (spec 125). */

import {
  ConnectionProvider,
  ConnectionStatus,
  KnowledgeScopeKind,
  type Connection,
} from '@shepai/core/domain/generated/output';
import type { ConnectionOverview } from '@shepai/core/application/use-cases/trackers/get-tracker-overview.use-case';
import type { KnowledgeSourceView } from '@shepai/core/application/use-cases/knowledge/manage-knowledge-sources.use-case';
import type { SpaceKnowledge } from '@shepai/core/application/use-cases/knowledge/list-knowledge.use-case';

const T = new Date('2026-10-01T10:00:00Z');

export const PRODUCT_LINES = [
  { id: 'line-payments', spaceId: 'space-acme', name: 'Payments' },
  { id: 'line-growth', spaceId: 'space-acme', name: 'Growth' },
];

export const NOTION: Connection = {
  id: 'conn-notion',
  provider: ConnectionProvider.Notion,
  name: 'Acme Notion',
  slug: 'acme-notion',
  spaceId: 'space-acme',
  accountName: 'Acme',
  status: ConnectionStatus.Connected,
  createdAt: T,
  updatedAt: T,
};

export const HANDBOOK_SOURCE: KnowledgeSourceView = {
  source: {
    id: 'source-handbook',
    connectionId: NOTION.id,
    spaceId: 'space-acme',
    scopeId: 'handbook',
    scopeKind: KnowledgeScopeKind.Page,
    scopeTitle: 'Engineering handbook',
    intervalMinutes: 60,
    enabled: true,
    lastRunAt: T,
    lastRun: { added: 24, updated: 3, removed: 1, failed: 0 },
    createdAt: T,
    updatedAt: T,
  },
  connection: NOTION,
  documents: 26,
};

export const PRD_SOURCE: KnowledgeSourceView = {
  source: {
    ...HANDBOOK_SOURCE.source,
    id: 'source-prds',
    productLineId: 'line-payments',
    scopeId: 'prds',
    scopeKind: KnowledgeScopeKind.Database,
    scopeTitle: 'Payments PRDs',
    intervalMinutes: 240,
    enabled: false,
    lastError: 'Notion: rate limited; retry after 30s',
  },
  connection: NOTION,
  documents: 9,
};

export const NOTION_OVERVIEW: ConnectionOverview = {
  connection: NOTION,
  spaceName: 'Acme',
  rules: [],
  sources: [HANDBOOK_SOURCE, PRD_SOURCE],
};

export const SPACE_KNOWLEDGE: SpaceKnowledge[] = [
  {
    space: { id: 'space-acme', name: 'Acme' },
    documents: [
      {
        id: 'doc-release',
        sourceId: HANDBOOK_SOURCE.source.id,
        title: 'Release process',
        url: 'https://www.notion.so/release',
        pageEditedAt: T,
      },
      {
        id: 'doc-refunds',
        sourceId: PRD_SOURCE.source.id,
        title: 'Refunds for guest orders',
        url: 'https://www.notion.so/refunds',
        productLineId: 'line-payments',
        pageEditedAt: T,
      },
    ],
  },
];

export const PRODUCT_LINE_NAMES: Record<string, string> = Object.fromEntries(
  PRODUCT_LINES.map((line) => [line.id, line.name])
);
