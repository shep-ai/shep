import { injectable, inject } from 'tsyringe';
import type { TimeEntry } from '../../../domain/generated/output.js';
import type { ITimeEntryRepository } from '../../ports/output/repositories/time-entry-repository.interface.js';

export interface ListTimeEntriesResult {
  ok: true;
  timeEntries: TimeEntry[];
  totalMinutes: number;
}

@injectable()
export class ListTimeEntriesUseCase {
  constructor(
    @inject('ITimeEntryRepository') private readonly timeEntryRepo: ITimeEntryRepository
  ) {}

  async execute(workItemId: string): Promise<ListTimeEntriesResult> {
    const [timeEntries, totalMinutes] = await Promise.all([
      this.timeEntryRepo.listByWorkItem(workItemId),
      this.timeEntryRepo.getTotalMinutes(workItemId),
    ]);
    return { ok: true, timeEntries, totalMinutes };
  }
}
