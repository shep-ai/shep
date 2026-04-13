import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import type { TimeEntry } from '../../../domain/generated/output.js';
import type { ITimeEntryRepository } from '../../ports/output/repositories/time-entry-repository.interface.js';

export type LogTimeEntryResult = { ok: true; timeEntry: TimeEntry } | { ok: false; error: string };

@injectable()
export class LogTimeEntryUseCase {
  constructor(
    @inject('ITimeEntryRepository') private readonly timeEntryRepo: ITimeEntryRepository
  ) {}

  async execute(
    workItemId: string,
    durationMinutes: number,
    note?: string
  ): Promise<LogTimeEntryResult> {
    if (!workItemId.trim()) return { ok: false, error: 'Work item ID is required' };
    if (durationMinutes <= 0)
      return { ok: false, error: 'Duration must be greater than 0 minutes' };

    const now = new Date();
    const timeEntry: TimeEntry = {
      id: randomUUID(),
      workItemId,
      durationMinutes,
      note,
      loggedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await this.timeEntryRepo.create(timeEntry);
    return { ok: true, timeEntry };
  }
}
