/**
 * SyncRepoUseCase
 *
 * Stages local changes, commits them, and pushes to the existing GitHub
 * remote. Drives the SmartDeployButton's "Save changes" / "Save & publish"
 * actions for non-technical users — the word "sync" never appears in the
 * UI but is kept in the use-case name as the canonical engineering term.
 *
 * Pre-conditions enforced here so the route layer can stay thin:
 *   1. The Application exists.
 *   2. The Application has a `gitRemoteUrl` (Publish flow has already run).
 *
 * All progress + errors are appended to the operation log under
 * `OperationLogKind.RepoSync` so the OperationLogsDrawer can show the
 * full history including subprocess stderr on failure.
 */

import { inject, injectable } from 'tsyringe';

import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type {
  CommitAndPushResult,
  IGitRemoteService,
} from '../../ports/output/services/git-remote.service.interface.js';
import type { IOperationLogService } from '../../ports/output/services/operation-log-service.interface.js';
import { ApplicationNotFoundError } from '../../../domain/errors/application-not-found.error.js';
import { GitRemoteCreationError } from '../../../domain/errors/git-remote-creation.error.js';
import { OperationLogKind } from '../../../domain/generated/output.js';

export interface SyncRepoInput {
  applicationId: string;
  /**
   * Optional commit message override. Defaults to a generic
   * `chore(shep): sync local changes` message that's friendly to read in a
   * GitHub commit history without exposing any user-facing copy.
   */
  message?: string;
}

const DEFAULT_COMMIT_MESSAGE = 'chore(shep): sync local changes';

@injectable()
export class SyncRepoUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly applicationRepo: IApplicationRepository,
    @inject('IGitRemoteService')
    private readonly gitRemoteService: IGitRemoteService,
    @inject('IOperationLogService')
    private readonly opLog: IOperationLogService
  ) {}

  async execute(input: SyncRepoInput): Promise<CommitAndPushResult> {
    const opKind = OperationLogKind.RepoSync;
    const opId = input.applicationId;

    await this.opLog.info(opKind, opId, 'Starting save & backup');

    const app = await this.applicationRepo.findById(input.applicationId);
    if (!app) {
      await this.opLog.error(opKind, opId, `Application not found: ${input.applicationId}`);
      throw new ApplicationNotFoundError(input.applicationId);
    }
    if (!app.gitRemoteUrl) {
      await this.opLog.error(
        opKind,
        opId,
        'Application has no git remote — Publish to GitHub flow must run first'
      );
      throw new GitRemoteCreationError(
        'No GitHub repository attached to this app yet — set one up first'
      );
    }

    try {
      const trimmedMessage = input.message?.trim();
      const result = await this.gitRemoteService.commitAndPush({
        cwd: app.repositoryPath,
        message:
          trimmedMessage && trimmedMessage.length > 0 ? trimmedMessage : DEFAULT_COMMIT_MESSAGE,
        onLog: (level, message, detail) => {
          // Translate the port's string union into an opLog method call.
          // Fire-and-forget so a logging hiccup never aborts the sync.
          const persisted: Promise<unknown> = (() => {
            switch (level) {
              case 'debug':
                return this.opLog.debug(opKind, opId, message, detail);
              case 'warn':
                return this.opLog.warn(opKind, opId, message, detail);
              case 'error':
                return this.opLog.error(opKind, opId, message, detail);
              case 'info':
              default:
                return this.opLog.info(opKind, opId, message, detail);
            }
          })();
          void persisted;
        },
      });

      if (!result.committed && !result.pushed) {
        await this.opLog.info(opKind, opId, 'Already up to date — nothing to save');
      } else if (result.committed && result.pushed) {
        await this.opLog.info(
          opKind,
          opId,
          `Saved & backed up successfully (${result.headSha.slice(0, 7)})`
        );
      } else if (result.pushed) {
        await this.opLog.info(
          opKind,
          opId,
          `Pushed pending commits to GitHub (${result.headSha.slice(0, 7)})`
        );
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.opLog.error(
        opKind,
        opId,
        `Save & backup failed: ${message}`,
        err instanceof Error && err.stack ? err.stack : undefined
      );
      throw err;
    }
  }
}
