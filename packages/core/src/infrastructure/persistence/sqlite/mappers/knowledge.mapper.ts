/** Row ⇄ entity conversion for knowledge sources and documents (spec 125). */

import type {
  KnowledgeDocument,
  KnowledgeScopeKind,
  KnowledgeSource,
  KnowledgeSyncSummary,
} from '../../../../domain/generated/output.js';
import { defined, millis, optionalDate, optionalMillis } from './row-values.js';

export interface KnowledgeSourceRow {
  id: string;
  connection_id: string;
  space_id: string;
  product_line_id: string | null;
  scope_id: string;
  scope_kind: string;
  scope_title: string;
  interval_minutes: number;
  enabled: number;
  last_run_at: number | null;
  last_run: string | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

export interface KnowledgeDocumentRow {
  id: string;
  source_id: string;
  space_id: string;
  product_line_id: string | null;
  page_id: string;
  title: string;
  url: string;
  content: string;
  page_edited_at: number;
  created_at: number;
  updated_at: number;
}

export function knowledgeSourceToDatabase(source: KnowledgeSource): KnowledgeSourceRow {
  return {
    id: source.id,
    connection_id: source.connectionId,
    space_id: source.spaceId,
    product_line_id: source.productLineId ?? null,
    scope_id: source.scopeId,
    scope_kind: source.scopeKind,
    scope_title: source.scopeTitle,
    interval_minutes: source.intervalMinutes,
    enabled: source.enabled ? 1 : 0,
    last_run_at: optionalMillis(source.lastRunAt),
    last_run: source.lastRun ? JSON.stringify(source.lastRun) : null,
    last_error: source.lastError ?? null,
    created_at: millis(source.createdAt),
    updated_at: millis(source.updatedAt),
  };
}

export function knowledgeSourceFromDatabase(row: KnowledgeSourceRow): KnowledgeSource {
  return {
    id: row.id,
    connectionId: row.connection_id,
    spaceId: row.space_id,
    ...defined({ productLineId: row.product_line_id }),
    scopeId: row.scope_id,
    scopeKind: row.scope_kind as KnowledgeScopeKind,
    scopeTitle: row.scope_title,
    intervalMinutes: row.interval_minutes,
    enabled: row.enabled === 1,
    ...defined({
      lastRunAt: optionalDate(row.last_run_at),
      lastRun: row.last_run === null ? null : (JSON.parse(row.last_run) as KnowledgeSyncSummary),
      lastError: row.last_error,
    }),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function knowledgeDocumentToDatabase(document: KnowledgeDocument): KnowledgeDocumentRow {
  return {
    id: document.id,
    source_id: document.sourceId,
    space_id: document.spaceId,
    product_line_id: document.productLineId ?? null,
    page_id: document.pageId,
    title: document.title,
    url: document.url,
    content: document.content,
    page_edited_at: millis(document.pageEditedAt),
    created_at: millis(document.createdAt),
    updated_at: millis(document.updatedAt),
  };
}

export function knowledgeDocumentFromDatabase(row: KnowledgeDocumentRow): KnowledgeDocument {
  return {
    id: row.id,
    sourceId: row.source_id,
    spaceId: row.space_id,
    ...defined({ productLineId: row.product_line_id }),
    pageId: row.page_id,
    title: row.title,
    url: row.url,
    content: row.content,
    pageEditedAt: new Date(row.page_edited_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
