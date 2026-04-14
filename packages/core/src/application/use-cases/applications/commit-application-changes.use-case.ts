/**
 * Commit Application Changes Use Case
 *
 * Stages and commits local working-tree changes for an application.
 * Thin orchestration: loads the application, delegates to IGitCommitService.
 */

import { inject, injectable } from 'tsyringe';

import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type {
  IGitCommitService,
  CommitChangesResult,
} from '../../ports/output/services/git-commit.service.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import { ApplicationNotFoundError } from '../../../domain/errors/application-not-found.error.js';

export interface CommitApplicationChangesInput {
  applicationId: string;
  message: string;
}

@injectable()
export class CommitApplicationChangesUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly applicationRepo: IApplicationRepository,
    @inject('IGitCommitService')
    private readonly gitCommit: IGitCommitService,
    @inject('ILogger')
    private readonly logger: ILogger
  ) {}

  async execute(input: CommitApplicationChangesInput): Promise<CommitChangesResult> {
    const { applicationId, message } = input;
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      throw new Error('Commit message is required');
    }
    const app = await this.applicationRepo.findById(applicationId);
    if (!app) throw new ApplicationNotFoundError(applicationId);

    this.logger.info('commit-application-changes: start', {
      applicationId,
      cwd: app.repositoryPath,
    });
    const result = await this.gitCommit.commitChanges({
      cwd: app.repositoryPath,
      message: trimmed,
    });
    this.logger.info('commit-application-changes: done', {
      applicationId,
      committed: result.committed,
    });
    return result;
  }
}
