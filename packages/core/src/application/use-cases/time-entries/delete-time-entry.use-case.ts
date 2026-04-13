import { injectable, inject } from 'tsyringe';
import type { ITimeEntryRepository } from '../../ports/output/repositories/time-entry-repository.interface.js';

export type DeleteTimeEntryResult = { ok: true } | { ok: false; error: string };

@injectable()
export class DeleteTimeEntryUseCase {
  constructor(
    @inject('ITimeEntryRepository') private readonly timeEntryRepo: ITimeEntryRepository
  ) {}

  async execute(id: string): Promise<DeleteTimeEntryResult> {
    const entry = await this.timeEntryRepo.findById(id);
    if (!entry) return { ok: false, error: 'Time entry not found' };

    await this.timeEntryRepo.delete(id);
    return { ok: true };
  }
}
