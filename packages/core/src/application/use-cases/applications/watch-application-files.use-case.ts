/**
 * Watch Application Files Use Case
 *
 * Subscribes to recursive filesystem change events under an application's
 * repositoryPath. Used by the IDE tab to refresh the tree and re-read
 * currently open files when the agent (or any other process) writes to
 * disk.
 */

import { inject, injectable } from 'tsyringe';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type {
  IApplicationFileSystemService,
  FileChangeListener,
  UnsubscribeFn,
} from '../../ports/output/services/application-file-system-service.interface.js';

export interface WatchApplicationFilesCommand {
  applicationId: string;
  onEvent: FileChangeListener;
}

@injectable()
export class WatchApplicationFilesUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository,
    @inject('IApplicationFileSystemService')
    private readonly fs: IApplicationFileSystemService
  ) {}

  async execute(command: WatchApplicationFilesCommand): Promise<UnsubscribeFn> {
    const app = await this.appRepo.findById(command.applicationId);
    if (!app) {
      throw new Error(`Application not found: ${command.applicationId}`);
    }
    return this.fs.watch(app.repositoryPath, command.onEvent);
  }
}
