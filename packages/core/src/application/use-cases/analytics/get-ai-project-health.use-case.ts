import { injectable, inject } from 'tsyringe';
import type { WorkItemState } from '../../../domain/generated/output.js';
import { StateGroup } from '../../../domain/generated/output.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';
import type { ICycleRepository } from '../../ports/output/repositories/cycle-repository.interface.js';
import type { IWorkItemStateRepository } from '../../ports/output/repositories/work-item-state-repository.interface.js';
import type { IAgentExecutorProvider } from '../../ports/output/agents/agent-executor-provider.interface.js';

export interface GetAiProjectHealthInput {
  projectId: string;
}

export interface ProjectHealthData {
  projectName: string;
  totalItems: number;
  completedItems: number;
  inProgressItems: number;
  notStartedItems: number;
  completionPercentage: number;
  activeCycles: number;
  totalCycles: number;
  aiSummary: string;
  recommendations?: string[];
}

export type GetAiProjectHealthResult =
  | { ok: true; health: ProjectHealthData }
  | { ok: false; error: string };

@injectable()
export class GetAiProjectHealthUseCase {
  constructor(
    @inject('IPmProjectRepository') private readonly projectRepo: IPmProjectRepository,
    @inject('IWorkItemRepository') private readonly workItemRepo: IWorkItemRepository,
    @inject('ICycleRepository') private readonly cycleRepo: ICycleRepository,
    @inject('IWorkItemStateRepository') private readonly stateRepo: IWorkItemStateRepository,
    @inject('IAgentExecutorProvider') private readonly agentProvider: IAgentExecutorProvider
  ) {}

  async execute(input: GetAiProjectHealthInput): Promise<GetAiProjectHealthResult> {
    const project = await this.projectRepo.findById(input.projectId);
    if (!project) {
      return { ok: false, error: `Project not found: "${input.projectId}"` };
    }

    const items = await this.workItemRepo.listByProject(input.projectId);
    const cycles = await this.cycleRepo.listByProject(input.projectId);
    const states = await this.stateRepo.listByProject(input.projectId);
    const stateMap = new Map<string, WorkItemState>(states.map((s) => [s.id, s]));

    let completedItems = 0;
    let inProgressItems = 0;
    let notStartedItems = 0;

    for (const item of items) {
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

    const totalItems = items.length;
    const completionPercentage = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;
    const activeCycles = cycles.filter((c) => c.status === 'Active').length;

    let aiSummary = `${project.name}: ${completedItems}/${totalItems} items completed (${Math.round(completionPercentage)}%).`;
    let recommendations: string[] | undefined;

    try {
      const executor = await this.agentProvider.getExecutor();

      const prompt = [
        'Analyze the following project health data and provide an assessment.',
        'Return a JSON object with:',
        '- overallScore: number 0-100',
        '- narrativeSummary: 2-3 sentence health assessment',
        '- recommendations: array of actionable recommendations',
        '',
        `Project: ${project.name}`,
        `Total work items: ${totalItems}`,
        `Completed: ${completedItems}`,
        `In Progress: ${inProgressItems}`,
        `Not Started: ${notStartedItems}`,
        `Completion: ${Math.round(completionPercentage)}%`,
        `Total cycles: ${cycles.length}`,
        `Active cycles: ${activeCycles}`,
      ]
        .filter(Boolean)
        .join('\n');

      const result = await executor.execute(prompt, {
        outputSchema: {
          type: 'object',
          properties: {
            overallScore: { type: 'number' },
            narrativeSummary: { type: 'string' },
            recommendations: { type: 'array', items: { type: 'string' } },
          },
        },
      });

      const parsed = JSON.parse(result.result);
      if (parsed.narrativeSummary) aiSummary = parsed.narrativeSummary;
      if (parsed.recommendations) recommendations = parsed.recommendations;
    } catch {
      // AI failure is non-fatal — we still return computed metrics
    }

    return {
      ok: true,
      health: {
        projectName: project.name,
        totalItems,
        completedItems,
        inProgressItems,
        notStartedItems,
        completionPercentage,
        activeCycles,
        totalCycles: cycles.length,
        aiSummary,
        recommendations,
      },
    };
  }
}
