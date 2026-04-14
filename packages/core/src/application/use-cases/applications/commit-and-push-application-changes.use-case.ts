/**
 * Commit And Push Application Changes Use Case
 *
 * Stages, commits, and pushes local working-tree changes for an
 * application. Thin orchestration: loads the application, delegates to
 * IGitCommitService.
 */

import { inject, injectable } from 'tsyringe';

import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type {
  IGitCommitService,
  CommitAndPushResult,
} from '../../ports/output/services/git-commit.service.interface.js';
import type { ILogger } from '../../ports/output/services/logger.interface.js';
import { ApplicationNotFoundError } from '../../../domain/errors/application-not-found.error.js';

export interface CommitAndPushApplicationChangesInput {
  applicationId: string;
  message: string;
}

@injectable()
export class CommitAndPushApplicationChangesUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly applicationRepo: IApplicationRepository,
    @inject('IGitCommitService')
    private readonly gitCommit: IGitCommitService,
    @inject('ILogger')
    private readonly logger: ILogger
  ) {}

  async execute(input: CommitAndPushApplicationChangesInput): Promise<CommitAndPushResult> {
    const { applicationId, message } = input;
    const trimmed = message.trim();
    if (trimmed.length === 0) {
      throw new Error('Commit message is required');
    }
    const app = await this.applicationRepo.findById(applicationId);
    if (!app) throw new ApplicationNotFoundError(applicationId);

    this.logger.info('commit-and-push-application-changes: start', {
      applicationId,
      cwd: app.repositoryPath,
    });
    const result = await this.gitCommit.commitAndPush({
      cwd: app.repositoryPath,
      message: trimmed,
    });
    this.logger.info('commit-and-push-application-changes: done', {
      applicationId,
      committed: result.committed,
      pushed: result.pushed,
    });
    return result;
  }
}
