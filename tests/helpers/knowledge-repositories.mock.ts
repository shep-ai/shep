/** In-memory knowledge repositories for use-case tests (spec 125). */

import type { KnowledgeDocument, KnowledgeSource } from '@/domain/generated/output.js';
import type {
  IKnowledgeDocumentRepository,
  IKnowledgeSourceRepository,
} from '@/application/ports/output/repositories/knowledge-repository.interface.js';

export class InMemoryKnowledgeSources implements IKnowledgeSourceRepository {
  readonly rows = new Map<string, KnowledgeSource>();
  async list(connectionId?: string) {
    return [...this.rows.values()].filter((s) => !connectionId || s.connectionId === connectionId);
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async create(source: KnowledgeSource) {
    this.rows.set(source.id, source);
  }
  async update(source: KnowledgeSource) {
    this.rows.set(source.id, source);
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
}

export class InMemoryKnowledgeDocuments implements IKnowledgeDocumentRepository {
  readonly rows = new Map<string, KnowledgeDocument>();
  private sorted(filter: (d: KnowledgeDocument) => boolean) {
    return [...this.rows.values()].filter(filter).sort((a, b) => a.title.localeCompare(b.title));
  }
  async listBySource(sourceId: string) {
    return this.sorted((d) => d.sourceId === sourceId);
  }
  async listVisible(spaceId: string, productLineId?: string) {
    return this.sorted(
      (d) =>
        d.spaceId === spaceId &&
        (d.productLineId === undefined ||
          (productLineId !== undefined && d.productLineId === productLineId))
    );
  }
  async listBySpace(spaceId: string) {
    return this.sorted((d) => d.spaceId === spaceId);
  }
  async create(document: KnowledgeDocument) {
    this.rows.set(document.id, document);
  }
  async update(document: KnowledgeDocument) {
    this.rows.set(document.id, document);
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
  async deleteBySource(sourceId: string) {
    for (const d of await this.listBySource(sourceId)) this.rows.delete(d.id);
  }
}
