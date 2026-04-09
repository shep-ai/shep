/**
 * List Application Files Use Case
 *
 * Returns a directory tree rooted at an application's repositoryPath.
 * Presentation layers render this in the IDE file explorer.
 */

import { inject, injectable } from 'tsyringe';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type {
  IApplicationFileSystemService,
  FileTreeEntry,
} from '../../ports/output/services/application-file-system-service.interface.js';

export interface ListApplicationFilesCommand {
  applicationId: string;
}

@injectable()
export class ListApplicationFilesUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository,
    @inject('IApplicationFileSystemService')
    private readonly fs: IApplicationFileSystemService
  ) {}

  async execute(command: ListApplicationFilesCommand): Promise<FileTreeEntry> {
    const app = await this.appRepo.findById(command.applicationId);
    if (!app) {
      throw new Error(`Application not found: ${command.applicationId}`);
    }
    return this.fs.listTree(app.repositoryPath);
  }
}
