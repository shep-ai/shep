/**
 * ListOwnersUseCase (feature 098, phase 2).
 *
 * Lists Owners, optionally filtered to a single team. Read-only.
 */

import { inject, injectable } from 'tsyringe';
import type { Owner } from '../../../../domain/generated/output.js';
import type { IOwnerRepository } from '../../../ports/output/repositories/owner-repository.interface.js';

export interface ListOwnersInput {
  /** Restrict to owners on this team. Omit to list every owner. */
  teamId?: string;
}

@injectable()
export class ListOwnersUseCase {
  constructor(@inject('IOwnerRepository') private readonly ownerRepo: IOwnerRepository) {}

  async execute(input: ListOwnersInput = {}): Promise<Owner[]> {
    if (input.teamId !== undefined) {
      return this.ownerRepo.listByTeam(input.teamId);
    }
    return this.ownerRepo.listAll();
  }
}
