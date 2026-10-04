/**
 * ManageKnowledgeSourcesUseCase (spec 125)
 *
 * Adds, lists, pauses and removes knowledge sources: a page tree or database
 * of a knowledge connection (Notion) kept in sync as knowledge of the
 * connection's space, optionally limited to one of its product lines. A
 * source is only added once the tool confirms the page or database exists and
 * is shared with the integration.
 */

import { randomUUID } from 'node:crypto';
import { injectable, inject } from 'tsyringe';
import {
  ConnectionKind,
  type Connection,
  type KnowledgeSource,
} from '../../../domain/generated/output.js';
import { connectionKind } from '../../../domain/shared/connection-kind.js';
import {
  DEFAULT_KNOWLEDGE_INTERVAL_MINUTES,
  MAX_KNOWLEDGE_INTERVAL_MINUTES,
  MIN_KNOWLEDGE_INTERVAL_MINUTES,
} from '../../../domain/shared/knowledge.js';
import type { IConnectionRepository } from '../../ports/output/repositories/connection-repository.interface.js';
import type {
  IKnowledgeDocumentRepository,
  IKnowledgeSourceRepository,
} from '../../ports/output/repositories/knowledge-repository.interface.js';
import type { IProductLineRepository } from '../../ports/output/repositories/product-line-repository.interface.js';
import type { IKnowledgeClientFactory } from '../../ports/output/services/knowledge-client.interface.js';
import {
  errorMessage,
  failure,
  findConnection,
  type ConnectionResult,
} from '../connections/connection-refs.js';

export interface CreateKnowledgeSourceInput {
  /** Connection id or slug. */
  connection: string;
  /** A page or database id, or a link to one. */
  scope: string;
  /** Product line id or slug in the connection's space; space-wide when omitted. */
  productLine?: string;
  intervalMinutes?: number;
}

export interface KnowledgeSourceView {
  source: KnowledgeSource;
  connection: Connection;
  /** Documents synced from the source. */
  documents: number;
}

@injectable()
export class ManageKnowledgeSourcesUseCase {
  constructor(
    @inject('IKnowledgeSourceRepository') private readonly sources: IKnowledgeSourceRepository,
    @inject('IKnowledgeDocumentRepository')
    private readonly documents: IKnowledgeDocumentRepository,
    @inject('IConnectionRepository') private readonly connections: IConnectionRepository,
    @inject('IProductLineRepository') private readonly productLines: IProductLineRepository,
    @inject('IKnowledgeClientFactory') private readonly clients: IKnowledgeClientFactory
  ) {}

  async list(): Promise<KnowledgeSourceView[]> {
    const views: KnowledgeSourceView[] = [];
    for (const source of await this.sources.list()) {
      const connection = await this.connections.findById(source.connectionId);
      if (!connection) continue;
      const documents = (await this.documents.listBySource(source.id)).length;
      views.push({ source, connection, documents });
    }
    return views;
  }

  async create(
    input: CreateKnowledgeSourceInput
  ): Promise<ConnectionResult<{ source: KnowledgeSource }>> {
    const connection = await findConnection(this.connections, input.connection);
    if (!connection) return failure(`No connection "${input.connection}".`);
    if (connectionKind(connection.provider) !== ConnectionKind.Knowledge) {
      return failure(
        `${connection.name} is a ${connection.provider} connection, not a knowledge tool.`
      );
    }
    const intervalMinutes = input.intervalMinutes ?? DEFAULT_KNOWLEDGE_INTERVAL_MINUTES;
    if (
      !Number.isInteger(intervalMinutes) ||
      intervalMinutes < MIN_KNOWLEDGE_INTERVAL_MINUTES ||
      intervalMinutes > MAX_KNOWLEDGE_INTERVAL_MINUTES
    ) {
      return failure(
        `The interval must be between ${MIN_KNOWLEDGE_INTERVAL_MINUTES} and ${MAX_KNOWLEDGE_INTERVAL_MINUTES} minutes.`
      );
    }
    let productLineId: string | undefined;
    if (input.productLine?.trim()) {
      const ref = input.productLine.trim();
      const line =
        (await this.productLines.findBySlug(connection.spaceId, ref.toLowerCase())) ??
        (await this.productLines.findById(ref));
      if (line?.spaceId !== connection.spaceId) {
        return failure(`No product line "${ref}" in the space of ${connection.name}.`);
      }
      productLineId = line.id;
    }

    let scope;
    try {
      const secret = (await this.connections.getSecret(connection.id)) ?? '';
      scope = await this.clients
        .create({ provider: connection.provider, secret })
        .describeScope(input.scope);
    } catch (error) {
      return failure(errorMessage(error));
    }
    const existing = await this.sources.list(connection.id);
    if (existing.some((s) => s.scopeId === scope.id && s.productLineId === productLineId)) {
      return failure(`${scope.title} is already a knowledge source of ${connection.name}.`);
    }

    const now = new Date();
    const source: KnowledgeSource = {
      id: randomUUID(),
      connectionId: connection.id,
      spaceId: connection.spaceId,
      ...(productLineId ? { productLineId } : {}),
      scopeId: scope.id,
      scopeKind: scope.kind,
      scopeTitle: scope.title,
      intervalMinutes,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    await this.sources.create(source);
    return { ok: true, source };
  }

  async setEnabled(id: string, enabled: boolean): Promise<ConnectionResult> {
    const source = await this.sources.findById(id.trim());
    if (!source) return failure(`No knowledge source "${id}".`);
    await this.sources.update({ ...source, enabled, updatedAt: new Date() });
    return { ok: true };
  }

  /** Removes the source and the documents it synced. */
  async remove(id: string): Promise<ConnectionResult> {
    const source = await this.sources.findById(id.trim());
    if (!source) return failure(`No knowledge source "${id}".`);
    await this.documents.deleteBySource(source.id);
    await this.sources.delete(source.id);
    return { ok: true };
  }
}
