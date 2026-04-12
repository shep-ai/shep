/**
 * Read Application File Use Case
 *
 * Reads a single text file from an application's repositoryPath.
 */

import { inject, injectable } from 'tsyringe';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type {
  IApplicationFileSystemService,
  ReadFileResult,
} from '../../ports/output/services/application-file-system-service.interface.js';

export interface ReadApplicationFileCommand {
  applicationId: string;
  /** POSIX-style path relative to the application root. */
  path: string;
}

@injectable()
export class ReadApplicationFileUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository,
    @inject('IApplicationFileSystemService')
    private readonly fs: IApplicationFileSystemService
  ) {}

  async execute(command: ReadApplicationFileCommand): Promise<ReadFileResult> {
    if (!command.path || command.path.trim().length === 0) {
      throw new Error('path is required');
    }
    const app = await this.appRepo.findById(command.applicationId);
    if (!app) {
      throw new Error(`Application not found: ${command.applicationId}`);
    }
    return this.fs.readFile(app.repositoryPath, command.path);
  }
}
