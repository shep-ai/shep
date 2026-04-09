/**
 * Read Application File Raw Use Case
 *
 * Returns the raw bytes + MIME type of a file inside an application's
 * repositoryPath. Used by the web IDE tab to stream images (and other
 * binary assets) through a dedicated endpoint instead of the JSON text
 * read path.
 */

import { inject, injectable } from 'tsyringe';
import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type {
  IApplicationFileSystemService,
  ReadFileBufferResult,
} from '../../ports/output/services/application-file-system-service.interface.js';

export interface ReadApplicationFileRawCommand {
  applicationId: string;
  /** POSIX-style path relative to the application root. */
  path: string;
}

@injectable()
export class ReadApplicationFileRawUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly appRepo: IApplicationRepository,
    @inject('IApplicationFileSystemService')
    private readonly fs: IApplicationFileSystemService
  ) {}

  async execute(command: ReadApplicationFileRawCommand): Promise<ReadFileBufferResult> {
    if (!command.path || command.path.trim().length === 0) {
      throw new Error('path is required');
    }
    const app = await this.appRepo.findById(command.applicationId);
    if (!app) {
      throw new Error(`Application not found: ${command.applicationId}`);
    }
    return this.fs.readFileBuffer(app.repositoryPath, command.path);
  }
}
