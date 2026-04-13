import { injectable, inject } from 'tsyringe';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '../../ports/output/repositories/work-item-state-repository.interface.js';
import type { IPmProjectRepository } from '../../ports/output/repositories/pm-project-repository.interface.js';

export interface StateBreakdownItem {
  stateId: string;
  stateName: string;
  stateGroup: string;
  stateColor: string;
  count: number;
}

export interface PriorityBreakdownItem {
  priority: string;
  count: number;
}

export interface ProjectBreakdownData {
  projectId: string;
  projectName: string;
  totalItems: number;
  byState: StateBreakdownItem[];
  byPriority: PriorityBreakdownItem[];
  byStateGroup: { group: string; count: number }[];
}

export type GetProjectBreakdownResult =
  | { ok: true; data: ProjectBreakdownData }
  | { ok: false; error: string };

@injectable()
export class GetProjectBreakdownUseCase {
  constructor(
    @inject('IPmProjectRepository') private readonly projectRepo: IPmProjectRepository,
    @inject('IWorkItemRepository') private readonly workItemRepo: IWorkItemRepository,
    @inject('IWorkItemStateRepository') private readonly stateRepo: IWorkItemStateRepository
  ) {}

  async execute(projectId: string): Promise<GetProjectBreakdownResult> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) {
      return { ok: false, error: `Project not found: "${projectId}"` };
    }

    const workItems = await this.workItemRepo.listByProject(projectId);
    const states = await this.stateRepo.listByProject(projectId);
    const stateMap = new Map(states.map((s) => [s.id, s]));

    const stateCounts = new Map<string, number>();
    const priorityCounts = new Map<string, number>();
    const stateGroupCounts = new Map<string, number>();

    for (const item of workItems) {
      stateCounts.set(item.stateId, (stateCounts.get(item.stateId) ?? 0) + 1);
      priorityCounts.set(item.priority, (priorityCounts.get(item.priority) ?? 0) + 1);

      const state = stateMap.get(item.stateId);
      if (state) {
        stateGroupCounts.set(state.stateGroup, (stateGroupCounts.get(state.stateGroup) ?? 0) + 1);
      }
    }

    const byState: StateBreakdownItem[] = states.map((s) => ({
      stateId: s.id,
      stateName: s.name,
      stateGroup: s.stateGroup,
      stateColor: s.color,
      count: stateCounts.get(s.id) ?? 0,
    }));

    const priorityOrder = ['Urgent', 'High', 'Medium', 'Low', 'None'];
    const byPriority: PriorityBreakdownItem[] = priorityOrder.map((p) => ({
      priority: p,
      count: priorityCounts.get(p) ?? 0,
    }));

    const groupOrder = ['Backlog', 'Unstarted', 'Started', 'Completed', 'Cancelled'];
    const byStateGroup = groupOrder.map((g) => ({
      group: g,
      count: stateGroupCounts.get(g) ?? 0,
    }));

    return {
      ok: true,
      data: {
        projectId,
        projectName: project.name,
        totalItems: workItems.length,
        byState,
        byPriority,
        byStateGroup,
      },
    };
  }
}
