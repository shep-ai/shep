/**
 * Write Application File Use Case
 *
 * Writes UTF-8 text to a file inside an application's repositoryPath.
 * Used by the IDE tab to save edits.
 */

import { inject, injectable } from 'tsyringe';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IApplicationFileSystemService } from '../../ports/output/services/application-file-system-service.interface.js';

export interface WriteApplicationFileCommand {
  applicationId: string;
  /** POSIX-style path relative to the application root. */
  path: string;
  /** UTF-8 text contents to write. */
  content: string;
}

@injectable()
export class WriteApplicationFileUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository,
    @inject('IApplicationFileSystemService')
    private readonly fs: IApplicationFileSystemService
  ) {}

  async execute(command: WriteApplicationFileCommand): Promise<void> {
    if (!command.path || command.path.trim().length === 0) {
      throw new Error('path is required');
    }
    const app = await this.appRepo.findById(command.applicationId);
    if (!app) {
      throw new Error(`Application not found: ${command.applicationId}`);
    }
    await this.fs.writeFile(app.repositoryPath, command.path, command.content);
  }
}
