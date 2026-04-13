import { injectable, inject } from 'tsyringe';
import type { Epic } from '../../../domain/generated/output.js';
import type { IEpicRepository } from '../../ports/output/repositories/epic-repository.interface.js';

export interface ListEpicsResult {
  ok: true;
  epics: Epic[];
}

@injectable()
export class ListEpicsUseCase {
  constructor(@inject('IEpicRepository') private readonly epicRepo: IEpicRepository) {}

  async execute(projectId: string): Promise<ListEpicsResult> {
    const epics = await this.epicRepo.listByProject(projectId);
    return { ok: true, epics };
  }
}
