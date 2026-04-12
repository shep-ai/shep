import { injectable, inject } from 'tsyringe';
import type { ActivityEntry } from '../../../domain/generated/output.js';
import type { IActivityLogRepository } from '../../ports/output/repositories/activity-log-repository.interface.js';

@injectable()
export class ListActivityLogUseCase {
  constructor(
    @inject('IActivityLogRepository') private readonly activityRepo: IActivityLogRepository
  ) {}

  async execute(workItemId: string): Promise<ActivityEntry[]> {
    return this.activityRepo.listByWorkItem(workItemId);
  }
}
