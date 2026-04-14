import { inject, injectable } from 'tsyringe';

import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type { IGitRemoteService } from '../../ports/output/services/git-remote.service.interface.js';
import type { IOperationLogService } from '../../ports/output/services/operation-log-service.interface.js';
import { ApplicationNotFoundError } from '../../../domain/errors/application-not-found.error.js';
import { OperationLogKind } from '../../../domain/generated/output.js';

export interface CreateGitRemoteInput {
  applicationId: string;
  /**
   * Optional GitHub org/user login to create the repo under. Omit (or pass
   * the user's own login) for the personal namespace.
   */
  ownerLogin?: string;
  /** Optional override of the slug. Falls back to Application.slug. */
  repoName?: string;
  /** Optional visibility. Defaults to 'private' so user code is never
   *  exposed to the open internet without an explicit opt-in. */
  visibility?: 'public' | 'private';
}

export interface CreateGitRemoteResult {
  remoteUrl: string;
}

@injectable()
export class CreateGitRemoteUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly applicationRepo: IApplicationRepository,
    @inject('IGitRemoteService')
    private readonly gitRemoteService: IGitRemoteService,
    @inject('IOperationLogService')
    private readonly opLog: IOperationLogService
  ) {}

  async execute(input: CreateGitRemoteInput | string): Promise<CreateGitRemoteResult> {
    // Backward compat: callers that pass a bare string still work.
    const normalized: CreateGitRemoteInput =
      typeof input === 'string' ? { applicationId: input } : input;
    const opKind = OperationLogKind.GitRemoteCreate;
    const opId = normalized.applicationId;

    await this.opLog.info(opKind, opId, 'Starting GitHub repository creation');

    const app = await this.applicationRepo.findById(normalized.applicationId);
    if (!app) {
      await this.opLog.error(opKind, opId, `Application not found: ${normalized.applicationId}`);
      throw new ApplicationNotFoundError(normalized.applicationId);
    }

    const trimmedRepoName = normalized.repoName?.trim();
    const trimmedOwnerLogin = normalized.ownerLogin?.trim();
    try {
      const { remoteUrl } = await this.gitRemoteService.createGitHubRepoAndPush({
        cwd: app.repositoryPath,
        slug: trimmedRepoName && trimmedRepoName.length > 0 ? trimmedRepoName : app.slug,
        description: app.description,
        visibility: normalized.visibility ?? 'private',
        ownerLogin:
          trimmedOwnerLogin && trimmedOwnerLogin.length > 0 ? trimmedOwnerLogin : undefined,
        onLog: (level, message, detail) => {
          // Translate the port's string union into an opLog method. Fire-and-
          // forget — log persistence must never gate the actual operation.
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

      await this.applicationRepo.update(normalized.applicationId, { gitRemoteUrl: remoteUrl });
      await this.opLog.info(opKind, opId, `Persisted gitRemoteUrl on application: ${remoteUrl}`);
      return { remoteUrl };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.opLog.error(
        opKind,
        opId,
        `GitHub repo creation failed: ${message}`,
        err instanceof Error && err.stack ? err.stack : undefined
      );
      // Re-throw — the route layer turns the structured error into the right
      // HTTP status code.
      throw err;
    }
  }
}
