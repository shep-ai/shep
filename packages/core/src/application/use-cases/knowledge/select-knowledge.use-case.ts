/**
 * SelectKnowledgeUseCase (spec 125): the team knowledge an agent working in a
 * repository should read for its task — passages of the space's space-wide
 * documents (and its product line's, when the repository is in one), ranked
 * against the task text and rendered within a token budget, each naming the
 * page it came from. Empty without a task or a match.
 */

import { injectable, inject } from 'tsyringe';
import {
  rankPassages,
  splitIntoPassages,
  type KnowledgePassage,
} from '../../../domain/shared/knowledge.js';
import type { IKnowledgeDocumentRepository } from '../../ports/output/repositories/knowledge-repository.interface.js';
import { CHARS_PER_TOKEN } from '../project-memory/project-memory.constants.js';
import { ResolveSpaceContextUseCase } from '../spaces/resolve-space-context.use-case.js';

/** Tokens of team knowledge an agent prompt may carry. */
export const KNOWLEDGE_TOKEN_BUDGET = 1_000;

const HEADER = '### Team knowledge';
const SEPARATOR = '\n\n';

export interface SelectKnowledgeInput {
  repositoryPath: string;
  taskText: string;
  tokenBudget?: number;
}

export interface SelectKnowledgeResult {
  /** Markdown section, or '' when nothing applies. */
  blob: string;
  /** The passages included, best first. */
  passages: KnowledgePassage[];
}

function renderPassage(passage: KnowledgePassage): string {
  const where = passage.heading ? `${passage.title} › ${passage.heading}` : passage.title;
  return `From ${where} (${passage.url}):\n${passage.text}`;
}

@injectable()
export class SelectKnowledgeUseCase {
  constructor(
    @inject('IKnowledgeDocumentRepository')
    private readonly documents: IKnowledgeDocumentRepository,
    @inject(ResolveSpaceContextUseCase)
    private readonly resolveSpaceContext: ResolveSpaceContextUseCase
  ) {}

  async execute(input: SelectKnowledgeInput): Promise<SelectKnowledgeResult> {
    const empty = { blob: '', passages: [] };
    if (!input.repositoryPath.trim() || !input.taskText.trim()) return empty;

    const context = await this.resolveSpaceContext.execute(input.repositoryPath);
    const documents = await this.documents.listVisible(context.space.id, context.productLine?.id);
    const ranked = rankPassages(input.taskText, documents.flatMap(splitIntoPassages));
    if (ranked.length === 0) return empty;

    const budget = (input.tokenBudget ?? KNOWLEDGE_TOKEN_BUDGET) * CHARS_PER_TOKEN;
    const included: KnowledgePassage[] = [];
    let used = HEADER.length;
    for (const passage of ranked) {
      const cost = SEPARATOR.length + renderPassage(passage).length;
      if (used + cost > budget) break;
      included.push(passage);
      used += cost;
    }
    if (included.length === 0) return empty;
    return {
      blob: [HEADER, ...included.map(renderPassage)].join(SEPARATOR),
      passages: included,
    };
  }
}
