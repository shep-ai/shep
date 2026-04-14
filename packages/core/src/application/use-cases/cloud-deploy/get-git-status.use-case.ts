/**
 * GetGitStatusUseCase
 *
 * Single read-side entry point for the SmartDeployButton. The Web hook
 * polls this every few seconds via GET /api/applications/:id/git/status
 * so the button label can react to working-tree drift in near-real-time.
 *
 * Pure read — no side effects, no log entries written. Logging only kicks
 * in when the user takes a write action (Sync, Publish, Deploy).
 *
 * Two sources of truth are merged:
 *
 *   1. **Persisted Application.gitRemoteUrl** — authoritative for "does
 *      this app have a remote at all". Set when the publish flow ran
 *      successfully and never cleared by drift detection. If we have
 *      this, we know the remote exists.
 *
 *   2. **Live `git remote -v`** — authoritative for current branch +
 *      uncommitted/unpushed counts. Drives drift display only.
 *
 * Mixing these defends against a class of bugs where a transient git
 * subprocess failure (Windows path quirk, race with another git command,
 * `.git` momentarily locked) would otherwise make the UI show "No backup
 * yet" for an app that's actually fully published. The persisted URL wins
 * the hasRemote decision unconditionally.
 */

import { inject, injectable } from 'tsyringe';

import type { IApplicationRepository } from '../../ports/output/repositories/application-repository.interface.js';
import type {
  GitWorkingTreeStatus,
  IGitRemoteService,
} from '../../ports/output/services/git-remote.service.interface.js';
import { ApplicationNotFoundError } from '../../../domain/errors/application-not-found.error.js';

export interface GetGitStatusInput {
  applicationId: string;
}

@injectable()
export class GetGitStatusUseCase {
  constructor(
    @inject('IApplicationRepository')
    private readonly applicationRepo: IApplicationRepository,
    @inject('IGitRemoteService')
    private readonly gitRemoteService: IGitRemoteService
  ) {}

  async execute(input: GetGitStatusInput): Promise<GitWorkingTreeStatus> {
    const app = await this.applicationRepo.findById(input.applicationId);
    if (!app) throw new ApplicationNotFoundError(input.applicationId);

    const live = await this.gitRemoteService.getStatus(app.repositoryPath);

    // Persisted URL wins for hasRemote/remoteUrl. If the Application row
    // says it's published, treat it as published — even if the live git
    // subprocess didn't see the remote this tick.
    const persistedRemoteUrl = app.gitRemoteUrl ?? null;
    if (persistedRemoteUrl && persistedRemoteUrl.length > 0) {
      return {
        ...live,
        hasRemote: true,
        remoteUrl: live.remoteUrl ?? persistedRemoteUrl,
      };
    }

    return live;
  }
}
