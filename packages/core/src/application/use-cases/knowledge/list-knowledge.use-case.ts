/**
 * ListKnowledgeUseCase (spec 125): a space's knowledge documents, for people
 * to see what agents in the space can read. Documents are summarised — title,
 * link, product line and edit time — since their content can be long and
 * already lives in the knowledge tool.
 */

import { injectable, inject } from 'tsyringe';
import type { KnowledgeDocument, Space } from '../../../domain/generated/output.js';
import type { IKnowledgeDocumentRepository } from '../../ports/output/repositories/knowledge-repository.interface.js';
import type { ISpaceRepository } from '../../ports/output/repositories/space-repository.interface.js';
import { findSpace } from '../spaces/space-refs.js';
import { failure, type ConnectionResult } from '../connections/connection-refs.js';

export interface KnowledgeDocumentSummary {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  /** Set when only repositories of this product line see the document. */
  productLineId?: string;
  pageEditedAt: Date;
}

export interface SpaceKnowledge {
  space: { id: string; name: string };
  documents: KnowledgeDocumentSummary[];
}

function summarise(document: KnowledgeDocument): KnowledgeDocumentSummary {
  return {
    id: document.id,
    sourceId: document.sourceId,
    title: document.title,
    url: document.url,
    ...(document.productLineId ? { productLineId: document.productLineId } : {}),
    pageEditedAt: document.pageEditedAt,
  };
}

@injectable()
export class ListKnowledgeUseCase {
  constructor(
    @inject('IKnowledgeDocumentRepository')
    private readonly documents: IKnowledgeDocumentRepository,
    @inject('ISpaceRepository') private readonly spaces: ISpaceRepository
  ) {}

  /** `space` is a space id or slug; the default space when omitted. */
  async execute(
    space?: string
  ): Promise<ConnectionResult<{ space: Space; documents: KnowledgeDocumentSummary[] }>> {
    const found = space?.trim()
      ? await findSpace(this.spaces, space)
      : await this.spaces.getDefault();
    if (!found) return failure(`No space "${space}".`);
    const documents = await this.documents.listBySpace(found.id);
    return { ok: true, space: found, documents: documents.map(summarise) };
  }

  /** Every space that has knowledge documents, with them. */
  async listAll(): Promise<SpaceKnowledge[]> {
    const groups: SpaceKnowledge[] = [];
    for (const space of await this.spaces.list()) {
      const documents = await this.documents.listBySpace(space.id);
      if (documents.length === 0) continue;
      groups.push({
        space: { id: space.id, name: space.name },
        documents: documents.map(summarise),
      });
    }
    return groups;
  }
}
