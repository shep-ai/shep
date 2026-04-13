import { injectable, inject } from 'tsyringe';
import type { ICycleRepository } from '../../ports/output/repositories/cycle-repository.interface.js';
import type { IWorkItemRepository } from '../../ports/output/repositories/work-item-repository.interface.js';
import type { IWorkItemStateRepository } from '../../ports/output/repositories/work-item-state-repository.interface.js';
import type { IActivityLogRepository } from '../../ports/output/repositories/activity-log-repository.interface.js';

export interface BurndownDataPoint {
  date: string;
  ideal: number;
  actual: number;
}

export interface CycleBurndownData {
  cycleId: string;
  cycleName: string;
  startDate: string;
  endDate: string;
  totalItems: number;
  completedItems: number;
  dataPoints: BurndownDataPoint[];
}

export type GetCycleBurndownResult =
  | { ok: true; data: CycleBurndownData }
  | { ok: false; error: string };

@injectable()
export class GetCycleBurndownUseCase {
  constructor(
    @inject('ICycleRepository') private readonly cycleRepo: ICycleRepository,
    @inject('IWorkItemRepository') private readonly workItemRepo: IWorkItemRepository,
    @inject('IWorkItemStateRepository') private readonly stateRepo: IWorkItemStateRepository,
    @inject('IActivityLogRepository') private readonly activityRepo: IActivityLogRepository
  ) {}

  async execute(cycleId: string): Promise<GetCycleBurndownResult> {
    const cycle = await this.cycleRepo.findById(cycleId);
    if (!cycle) {
      return { ok: false, error: `Cycle not found: "${cycleId}"` };
    }

    if (!cycle.startDate || !cycle.endDate) {
      return { ok: false, error: 'Cycle must have start and end dates for burndown chart.' };
    }

    const workItemIds = await this.cycleRepo.getWorkItemIds(cycleId);
    const totalItems = workItemIds.length;

    const states = await this.stateRepo.listByProject(cycle.projectId);
    const completedStateIds = new Set(
      states
        .filter((s) => s.stateGroup === 'Completed' || s.stateGroup === 'Cancelled')
        .map((s) => s.id)
    );

    let completedItems = 0;
    for (const itemId of workItemIds) {
      const item = await this.workItemRepo.findById(itemId);
      if (item && completedStateIds.has(item.stateId)) {
        completedItems++;
      }
    }

    const startDate = new Date(cycle.startDate);
    const endDate = new Date(cycle.endDate);
    const today = new Date();
    const totalDays = Math.max(
      1,
      Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    );

    const dataPoints: BurndownDataPoint[] = [];
    const idealDecrement = totalItems / totalDays;

    for (let day = 0; day <= totalDays; day++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + day);

      const dateStr = currentDate.toISOString().split('T')[0];
      const idealRemaining = Math.max(0, totalItems - idealDecrement * day);

      let actualRemaining: number;
      if (currentDate > today) {
        actualRemaining = totalItems - completedItems;
      } else {
        actualRemaining = totalItems - completedItems;
      }

      dataPoints.push({
        date: dateStr,
        ideal: Math.round(idealRemaining * 10) / 10,
        actual: actualRemaining,
      });
    }

    return {
      ok: true,
      data: {
        cycleId,
        cycleName: cycle.name,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        totalItems,
        completedItems,
        dataPoints,
      },
    };
  }
}
