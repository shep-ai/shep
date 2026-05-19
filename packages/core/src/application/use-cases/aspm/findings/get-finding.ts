/**
 * GetFindingUseCase (feature 098, phase 3).
 *
 * Fetches one SecurityFinding by id. Throws {@link FindingNotFoundError}
 * when the row is missing or soft-deleted so callers don't have to branch
 * on null.
 */

import { inject, injectable } from 'tsyringe';

import { FindingNotFoundError } from '../../../../domain/aspm/errors/finding-not-found.error.js';
import type { SecurityFinding } from '../../../../domain/generated/output.js';
import type { IFindingRepository } from '../../../ports/output/repositories/finding-repository.interface.js';

export interface GetFindingInput {
  id: string;
}

@injectable()
export class GetFindingUseCase {
  constructor(@inject('IFindingRepository') private readonly repo: IFindingRepository) {}

  async execute(input: GetFindingInput): Promise<SecurityFinding> {
    const found = await this.repo.findById(input.id);
    if (found === null) throw new FindingNotFoundError(input.id);
    return found;
  }
}
