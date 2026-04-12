/**
 * Delete Application Use Case
 *
 * Stops any active interactive session for the application,
 * then soft-deletes the application record.
 */

import { injectable, inject } from 'tsyringe';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IInteractiveSessionService } from '../../ports/output/services/interactive-session-service.interface.js';

@injectable()
export class DeleteApplicationUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository,
    @inject('IInteractiveSessionService')
    private readonly sessionService: IInteractiveSessionService
  ) {}

  async execute(id: string): Promise<void> {
    // 1. Try to stop interactive session — catch errors (session may not exist)
    try {
      await this.sessionService.stopByFeature(`app-${id}`);
    } catch {
      // No active session or stop failed — continue with deletion
    }

    // 2. Soft-delete the application record
    await this.appRepo.softDelete(id);
  }
}
