/**
 * Get Application Use Case
 *
 * Retrieves a single application by its ID.
 */

import { injectable, inject } from 'tsyringe';
import type { Application } from '../../../domain/generated/output.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';

@injectable()
export class GetApplicationUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository
  ) {}

  async execute(id: string): Promise<Application | null> {
    return this.appRepo.findById(id);
  }
}
