import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type {
  IWorkItemRelationRepository,
  WorkItemRelation,
} from '../../ports/output/repositories/work-item-relation-repository.interface.js';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';

export interface CreateWorkItemRelationInput {
  sourceWorkItemId: string;
  targetWorkItemId: string;
  relationType: string;
}

export type CreateWorkItemRelationResult =
  | { ok: true; relation: WorkItemRelation }
  | { ok: false; error: string };

const VALID_RELATION_TYPES = [
  'Blocking',
  'RelatesTo',
  'Duplicate',
  'StartsBefore',
  'FinishesBefore',
];

@injectable()
export class CreateWorkItemRelationUseCase {
  constructor(
    @inject('IWorkItemRelationRepository')
    private readonly relationRepo: IWorkItemRelationRepository,
    @inject('IWorkItemRepository')
    private readonly workItemRepo: IWorkItemRepository
  ) {}

  async execute(input: CreateWorkItemRelationInput): Promise<CreateWorkItemRelationResult> {
    const { sourceWorkItemId, targetWorkItemId, relationType } = input;

    if (sourceWorkItemId === targetWorkItemId) {
      return { ok: false, error: 'Cannot create a relation from a work item to itself.' };
    }

    if (!VALID_RELATION_TYPES.includes(relationType)) {
      return {
        ok: false,
        error: `Invalid relation type: "${relationType}". Valid types: ${VALID_RELATION_TYPES.join(', ')}`,
      };
    }

    const source = await this.workItemRepo.findById(sourceWorkItemId);
    if (!source) {
      return { ok: false, error: `Source work item not found: "${sourceWorkItemId}"` };
    }

    const target = await this.workItemRepo.findById(targetWorkItemId);
    if (!target) {
      return { ok: false, error: `Target work item not found: "${targetWorkItemId}"` };
    }

    const existing = await this.relationRepo.findExisting(
      sourceWorkItemId,
      targetWorkItemId,
      relationType
    );
    if (existing) {
      return { ok: false, error: 'This relation already exists.' };
    }

    if (relationType === 'Blocking') {
      const isCircular = await this.detectCircularBlocking(targetWorkItemId, sourceWorkItemId);
      if (isCircular) {
        return {
          ok: false,
          error: 'Cannot create relation: would create a circular blocking chain.',
        };
      }
    }

    const now = new Date();
    const relation: WorkItemRelation = {
      id: randomUUID(),
      sourceWorkItemId,
      targetWorkItemId,
      relationType,
      createdAt: now,
    };

    await this.relationRepo.create(relation);
    return { ok: true, relation };
  }

  private async detectCircularBlocking(
    fromId: string,
    targetId: string,
    visited = new Set<string>()
  ): Promise<boolean> {
    if (fromId === targetId) return true;
    if (visited.has(fromId)) return false;
    visited.add(fromId);

    const relations = await this.relationRepo.listByWorkItem(fromId);
    const blockingOutgoing = relations.filter(
      (r) => r.relationType === 'Blocking' && r.sourceWorkItemId === fromId
    );

    for (const rel of blockingOutgoing) {
      if (await this.detectCircularBlocking(rel.targetWorkItemId, targetId, visited)) {
        return true;
      }
    }

    return false;
  }
}
