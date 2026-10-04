/**
 * SyncKnowledgeSourceUseCase (spec 125)
 *
 * Syncs one knowledge source: lists every page in its scope, reads the pages
 * edited since their document was stored (or never stored), and deletes the
 * documents of pages that are gone. A page that cannot be read is counted and
 * skipped; a rejected token or a rate limit stops the run before anything is
 * deleted, and the next run simply repeats it.
 */

import { randomUUID } from 'node:crypto';
import { injectable, inject } from 'tsyringe';
import type {
  Connection,
  KnowledgeDocument,
  KnowledgeSource,
  KnowledgeSyncSummary,
} from '../../../domain/generated/output.js';
import { MAX_DOCUMENT_CHARS } from '../../../domain/shared/knowledge.js';
import type { IConnectionRepository } from '../../ports/output/repositories/connection-repository.interface.js';
import type {
  IKnowledgeDocumentRepository,
  IKnowledgeSourceRepository,
} from '../../ports/output/repositories/knowledge-repository.interface.js';
import type {
  IKnowledgeClient,
  IKnowledgeClientFactory,
  KnowledgePageRef,
} from '../../ports/output/services/knowledge-client.interface.js';
import {
  ConnectionAuthError,
  ConnectionRateLimitError,
} from '../../ports/output/services/connection-errors.js';
import { errorMessage, failure, type ConnectionResult } from '../connections/connection-refs.js';
import { recordConnectionHealth } from '../connections/connection-health.js';

export interface KnowledgeSyncOutcome {
  source: KnowledgeSource;
  summary: KnowledgeSyncSummary;
  /** Why the run stopped early, when it did. */
  error?: string;
}

function isStoppingError(error: unknown): boolean {
  return error instanceof ConnectionAuthError || error instanceof ConnectionRateLimitError;
}

@injectable()
export class SyncKnowledgeSourceUseCase {
  constructor(
    @inject('IKnowledgeSourceRepository') private readonly sources: IKnowledgeSourceRepository,
    @inject('IKnowledgeDocumentRepository')
    private readonly documents: IKnowledgeDocumentRepository,
    @inject('IConnectionRepository') private readonly connections: IConnectionRepository,
    @inject('IKnowledgeClientFactory') private readonly clients: IKnowledgeClientFactory
  ) {}

  async execute(sourceId: string): Promise<ConnectionResult<KnowledgeSyncOutcome>> {
    const source = await this.sources.findById(sourceId.trim());
    if (!source) return failure(`No knowledge source "${sourceId}".`);
    const connection = await this.connections.findById(source.connectionId);
    if (!connection) {
      return failure(`The connection of knowledge source ${source.scopeTitle} no longer exists.`);
    }

    const summary: KnowledgeSyncSummary = { added: 0, updated: 0, removed: 0, failed: 0 };
    const startedAt = new Date();
    let error: string | undefined;
    try {
      await this.sync(source, await this.client(connection), summary);
    } catch (caught) {
      error = errorMessage(caught);
      await recordConnectionHealth(
        this.connections,
        connection,
        error,
        caught instanceof ConnectionAuthError
      );
    }
    if (!error) await recordConnectionHealth(this.connections, connection, undefined, false);

    const { lastError: _previous, ...rest } = source;
    const updated: KnowledgeSource = {
      ...rest,
      lastRunAt: startedAt,
      lastRun: summary,
      ...(error ? { lastError: error } : {}),
      updatedAt: new Date(),
    };
    await this.sources.update(updated);
    return { ok: true, source: updated, summary, ...(error ? { error } : {}) };
  }

  private async client(connection: Connection): Promise<IKnowledgeClient> {
    const secret = (await this.connections.getSecret(connection.id)) ?? '';
    return this.clients.create({ provider: connection.provider, secret });
  }

  private async sync(
    source: KnowledgeSource,
    client: IKnowledgeClient,
    summary: KnowledgeSyncSummary
  ): Promise<void> {
    const pages = await client.listPages({
      id: source.scopeId,
      kind: source.scopeKind,
      title: source.scopeTitle,
    });
    const stored = new Map(
      (await this.documents.listBySource(source.id)).map((document) => [document.pageId, document])
    );

    for (const page of pages) {
      const document = stored.get(page.pageId);
      stored.delete(page.pageId);
      try {
        await this.syncPage(source, client, page, document, summary);
      } catch (caught) {
        if (isStoppingError(caught)) throw caught;
        summary.failed += 1;
      }
    }
    // Every page was listed, so what is left is gone from the scope.
    for (const gone of stored.values()) {
      await this.documents.delete(gone.id);
      summary.removed += 1;
    }
  }

  private async syncPage(
    source: KnowledgeSource,
    client: IKnowledgeClient,
    page: KnowledgePageRef,
    document: KnowledgeDocument | undefined,
    summary: KnowledgeSyncSummary
  ): Promise<void> {
    const edited = !document || page.editedAt > new Date(document.pageEditedAt);
    if (!edited) {
      if (document.title !== page.title || document.url !== page.url) {
        await this.documents.update({
          ...document,
          title: page.title,
          url: page.url,
          updatedAt: new Date(),
        });
      }
      return;
    }
    const content = (await client.readPage(page.pageId)).slice(0, MAX_DOCUMENT_CHARS);
    const now = new Date();
    const fields = {
      sourceId: source.id,
      spaceId: source.spaceId,
      ...(source.productLineId ? { productLineId: source.productLineId } : {}),
      pageId: page.pageId,
      title: page.title,
      url: page.url,
      content,
      pageEditedAt: page.editedAt,
      updatedAt: now,
    };
    if (document) {
      const { productLineId: _line, ...kept } = document;
      await this.documents.update({ ...kept, ...fields });
      summary.updated += 1;
    } else {
      await this.documents.create({ id: randomUUID(), ...fields, createdAt: now });
      summary.added += 1;
    }
  }
}
