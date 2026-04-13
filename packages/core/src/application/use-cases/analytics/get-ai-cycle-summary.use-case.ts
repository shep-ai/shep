import { injectable, inject } from 'tsyringe';
import type { WorkItemState } from '../../../domain/generated/output.js';
import { StateGroup } from '../../../domain/generated/output.js';
import type { ICycleRepository } from '../../ports/output/repositories/cycle-repository.interface.js';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '../../ports/output/repositories/work-item-state-repository.interface.js';
import type { IAgentExecutorProvider } from '../../ports/output/agents/agent-executor-provider.interface.js';

export interface GetAiCycleSummaryInput {
  cycleId: string;
}

export interface CycleSummaryData {
  cycleName: string;
  totalItems: number;
  completedItems: number;
  inProgressItems: number;
  notStartedItems: number;
  completionPercentage: number;
  aiSummary: string;
  risks?: string[];
}

export type GetAiCycleSummaryResult =
  | { ok: true; summary: CycleSummaryData }
  | { ok: false; error: string };

@injectable()
export class GetAiCycleSummaryUseCase {
  constructor(
    @inject('ICycleRepository') private readonly cycleRepo: ICycleRepository,
    @inject('IWorkItemRepository') private readonly workItemRepo: IWorkItemRepository,
    @inject('IWorkItemStateRepository') private readonly stateRepo: IWorkItemStateRepository,
    @inject('IAgentExecutorProvider') private readonly agentProvider: IAgentExecutorProvider
  ) {}

  async execute(input: GetAiCycleSummaryInput): Promise<GetAiCycleSummaryResult> {
    const cycle = await this.cycleRepo.findById(input.cycleId);
    if (!cycle) {
      return { ok: false, error: `Cycle not found: "${input.cycleId}"` };
    }

    const workItemIds = await this.cycleRepo.getWorkItemIds(input.cycleId);
    const states = await this.stateRepo.listByProject(cycle.projectId);
    const stateMap = new Map<string, WorkItemState>(states.map((s) => [s.id, s]));

    const items = await Promise.all(workItemIds.map((id) => this.workItemRepo.findById(id)));
    const validItems = items.filter((i) => i != null);

    let completedItems = 0;
    let inProgressItems = 0;
    let notStartedItems = 0;

    for (const item of validItems) {
      const state = stateMap.get(item.stateId);
      if (!state) continue;
      switch (state.stateGroup) {
        case StateGroup.Completed:
          completedItems++;
          break;
        case StateGroup.Started:
          inProgressItems++;
          break;
        default:
          notStartedItems++;
          break;
      }
    }

    const totalItems = validItems.length;
    const completionPercentage = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

    let aiSummary = `${cycle.name}: ${completedItems}/${totalItems} items completed (${Math.round(completionPercentage)}%).`;
    let risks: string[] | undefined;

    try {
      const executor = await this.agentProvider.getExecutor();

      const prompt = [
        'Analyze the following sprint/cycle data and provide a concise progress summary.',
        'Return a JSON object with:',
        '- summary: a natural language progress summary (2-3 sentences)',
        '- risks: array of risk strings (empty if none)',
        '',
        `Cycle: ${cycle.name}`,
        `Status: ${cycle.status}`,
        cycle.startDate ? `Start: ${new Date(cycle.startDate).toISOString().split('T')[0]}` : '',
        cycle.endDate ? `End: ${new Date(cycle.endDate).toISOString().split('T')[0]}` : '',
        `Total items: ${totalItems}`,
        `Completed: ${completedItems}`,
        `In Progress: ${inProgressItems}`,
        `Not Started: ${notStartedItems}`,
        `Completion: ${Math.round(completionPercentage)}%`,
      ]
        .filter(Boolean)
        .join('\n');

      const result = await executor.execute(prompt, {
        outputSchema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            risks: { type: 'array', items: { type: 'string' } },
          },
        },
      });

      const parsed = JSON.parse(result.result);
      if (parsed.summary) aiSummary = parsed.summary;
      if (parsed.risks) risks = parsed.risks;
    } catch {
      // AI failure is non-fatal — we still return computed metrics
    }

    return {
      ok: true,
      summary: {
        cycleName: cycle.name,
        totalItems,
        completedItems,
        inProgressItems,
        notStartedItems,
        completionPercentage,
        aiSummary,
        risks,
      },
    };
  }
}
