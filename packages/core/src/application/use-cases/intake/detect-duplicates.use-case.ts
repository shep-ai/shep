import { injectable, inject } from 'tsyringe';
import type { WorkItem } from '../../../domain/generated/output.js';
import type { IIntakeItemRepository } from '../../ports/output/repositories/intake-item-repository.interface.js';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';

export interface DetectDuplicatesInput {
  intakeItemId: string;
  limit?: number;
}

export interface DuplicateCandidate {
  workItem: WorkItem;
  score: number;
}

export type DetectDuplicatesResult =
  | { ok: true; candidates: DuplicateCandidate[] }
  | { ok: false; error: string };

@injectable()
export class DetectDuplicatesUseCase {
  constructor(
    @inject('IIntakeItemRepository') private readonly intakeRepo: IIntakeItemRepository,
    @inject('IWorkItemRepository') private readonly workItemRepo: IWorkItemRepository
  ) {}

  async execute(input: DetectDuplicatesInput): Promise<DetectDuplicatesResult> {
    const item = await this.intakeRepo.findById(input.intakeItemId);
    if (!item) {
      return { ok: false, error: `Intake item not found: "${input.intakeItemId}"` };
    }

    const workItems = await this.workItemRepo.listByProject(item.projectId);
    if (workItems.length === 0) {
      return { ok: true, candidates: [] };
    }

    const queryTokens = this.tokenize(`${item.title} ${item.description ?? ''}`);

    const scored: DuplicateCandidate[] = workItems
      .map((wi) => {
        const wiTokens = this.tokenize(`${wi.title} ${wi.description ?? ''}`);
        const score = this.jaccardSimilarity(queryTokens, wiTokens);
        return { workItem: wi, score };
      })
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);

    const maxResults = input.limit ?? 5;
    return { ok: true, candidates: scored.slice(0, maxResults) };
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter((t) => t.length > 2)
    );
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const token of a) {
      if (b.has(token)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
