/**
 * List Applications Use Case
 *
 * Returns all (non-deleted) application records.
 */

import { injectable, inject } from 'tsyringe';
import type { Application } from '../../../domain/generated/output.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';

@injectable()
export class ListApplicationsUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository
  ) {}

  async execute(): Promise<Application[]> {
    return this.appRepo.list();
  }
}
