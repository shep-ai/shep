/**
 * SelectProjectMemoryUseCase
 *
 * The "smart" memory selector. Instead of injecting the whole store into every
 * prompt, it loads the candidate set (this repo's entries + all organization
 * entries), ranks them by relevance to the current task + phase via the injected
 * IMemoryRelevanceScorer, then greedily includes the highest-scored entries up
 * to a token budget and renders only that subset.
 *
 * The result is a compact, on-topic memory blob tailored per project / repo /
 * task / prompt — bounded in size no matter how large the store grows.
 *
 * The team knowledge most relevant to the task (synced documents of the
 * repository's space, spec 125) follows the memory, within its own budget, so
 * every consumer of project memory reads both. In a docs-first space
 * (spec 131) the plan and implement phases also get the docs-first
 * instructions.
 */

import { injectable, inject } from 'tsyringe';
import type { ProjectMemory } from '../../../domain/generated/output.js';
import type { IProjectMemoryRepository } from '../../ports/output/repositories/project-memory-repository.interface.js';
import type { IMemoryRelevanceScorer } from '../../ports/output/services/memory-relevance-scorer.interface.js';
import { loadCandidateMemory } from './load-candidate-memory.js';
import {
  ResolveSpaceContextUseCase,
  type SpaceContext,
} from '../spaces/resolve-space-context.use-case.js';
import { renderMemoryBlob } from './render-memory-blob.js';
import { MEMORY_TOKEN_BUDGET, CHARS_PER_TOKEN } from './project-memory.constants.js';
import { SelectKnowledgeUseCase } from '../knowledge/select-knowledge.use-case.js';
import { docsFirstInstructions, docsPathsOf } from '../../../domain/shared/docs-first.js';

export interface SelectProjectMemoryInput {
  /** Normalised repository path whose memory should be considered. */
  repositoryPath: string;
  /** Consuming phase / agent prompt (e.g. 'analyze', 'implement', 'ci-fix'). */
  phase?: string;
  /** Free text describing the current focus (spec, query, failure logs). */
  taskText?: string;
  /** Approximate token budget for the rendered blob. Defaults to MEMORY_TOKEN_BUDGET. */
  tokenBudget?: number;
}

export interface SelectProjectMemoryResult {
  /** Category-sectioned blob of the selected entries; empty when none apply. */
  blob: string;
  /** Number of entries included after ranking + budgeting. */
  selectedCount: number;
  /** Total candidate entries considered (repository + product line + space). */
  totalCount: number;
  /** Team knowledge passages included after the memory. */
  knowledgeCount: number;
}

@injectable()
export class SelectProjectMemoryUseCase {
  constructor(
    @inject('IProjectMemoryRepository')
    private readonly memoryRepo: IProjectMemoryRepository,
    @inject('IMemoryRelevanceScorer')
    private readonly scorer: IMemoryRelevanceScorer,
    @inject(ResolveSpaceContextUseCase)
    private readonly resolveSpaceContext: ResolveSpaceContextUseCase,
    @inject(SelectKnowledgeUseCase) private readonly selectKnowledge: SelectKnowledgeUseCase
  ) {}

  async execute(input: SelectProjectMemoryInput): Promise<SelectProjectMemoryResult> {
    const repositoryPath = input.repositoryPath?.trim();
    if (!repositoryPath) {
      return { blob: '', selectedCount: 0, totalCount: 0, knowledgeCount: 0 };
    }

    const context = await this.resolveSpaceContext.execute(repositoryPath);
    const memory = await this.selectMemory(context, input);
    const knowledge = await this.selectKnowledge.execute({
      repositoryPath,
      taskText: input.taskText ?? '',
    });
    const settings = context.space.agentSettings;
    const docsFirst =
      settings?.docsFirst && input.phase
        ? docsFirstInstructions(input.phase, docsPathsOf(settings))
        : '';
    return {
      blob: [memory.blob, knowledge.blob, docsFirst].filter((part) => part !== '').join('\n\n'),
      selectedCount: memory.selectedCount,
      totalCount: memory.totalCount,
      knowledgeCount: knowledge.passages.length,
    };
  }

  private async selectMemory(
    context: SpaceContext,
    input: SelectProjectMemoryInput
  ): Promise<{ blob: string; selectedCount: number; totalCount: number }> {
    const candidates = await loadCandidateMemory(this.memoryRepo, context);
    if (candidates.length === 0) {
      return { blob: '', selectedCount: 0, totalCount: 0 };
    }

    const ranked = await this.scorer.score(
      { taskText: input.taskText ?? '', phase: input.phase },
      candidates
    );

    const budgetChars = (input.tokenBudget ?? MEMORY_TOKEN_BUDGET) * CHARS_PER_TOKEN;
    const selected: ProjectMemory[] = [];
    let usedChars = 0;
    for (const { entry } of ranked) {
      const cost = entry.content.trim().length + 4; // + "- " bullet & newline overhead
      // Always include the single most relevant entry even if it alone exceeds
      // the budget; otherwise stop once the budget is reached.
      if (selected.length > 0 && usedChars + cost > budgetChars) break;
      selected.push(entry);
      usedChars += cost;
    }

    return {
      blob: renderMemoryBlob(selected),
      selectedCount: selected.length,
      totalCount: candidates.length,
    };
  }
}
