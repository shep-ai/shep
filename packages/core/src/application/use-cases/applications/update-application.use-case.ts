/**
 * Update Application Use Case
 *
 * Updates mutable fields on an existing application record.
 */

import { injectable, inject } from 'tsyringe';
import type { Application } from '../../../domain/generated/output.js';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';

export type UpdateApplicationFields = Partial<
  Pick<Application, 'name' | 'status' | 'additionalPaths' | 'agentType' | 'modelOverride'>
>;

@injectable()
export class UpdateApplicationUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository
  ) {}

  async execute(id: string, fields: UpdateApplicationFields): Promise<void> {
    return this.appRepo.update(id, fields);
  }
}
