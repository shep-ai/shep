/** Knowledge source and document repositories (spec 125). */

import type { KnowledgeDocument, KnowledgeSource } from '../../../../domain/generated/output.js';

export interface IKnowledgeSourceRepository {
  /** Every source, or the sources of one connection. */
  list(connectionId?: string): Promise<KnowledgeSource[]>;
  findById(id: string): Promise<KnowledgeSource | null>;
  create(source: KnowledgeSource): Promise<void>;
  update(source: KnowledgeSource): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IKnowledgeDocumentRepository {
  /** A source's documents, by title. */
  listBySource(sourceId: string): Promise<KnowledgeDocument[]>;
  /**
   * Documents a repository in the space may read: the space-wide ones, and the
   * product line's when one is given.
   */
  listVisible(spaceId: string, productLineId?: string): Promise<KnowledgeDocument[]>;
  /** Every document of a space, by title. */
  listBySpace(spaceId: string): Promise<KnowledgeDocument[]>;
  create(document: KnowledgeDocument): Promise<void>;
  update(document: KnowledgeDocument): Promise<void>;
  delete(id: string): Promise<void>;
  deleteBySource(sourceId: string): Promise<void>;
}
