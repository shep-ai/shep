/**
 * Init Remote Repository Use Case
 *
 * Orchestrates creating a GitHub repository and linking it to a local repo
 * that has no remote configured. Validates gh CLI availability, guards against
 * existing remotes, and delegates to IGitPrService.createGitHubRepo() for the
 * atomic create + remote + push operation.
 */

import { injectable, inject } from 'tsyringe';
import { basename } from 'node:path';
import type { IGitPrService } from '../../ports/output/services/git-pr-service.interface.js';
import {
  GitPrError,
  GitPrErrorCode,
} from '../../ports/output/services/git-pr-service.interface.js';
import type { IToolInstallerService } from '../../ports/output/services/tool-installer.service.js';

export interface InitRemoteInput {
  cwd: string;
  name?: string;
  isPublic?: boolean;
  org?: string;
}

export interface InitRemoteResult {
  repoUrl: string;
  repoName: string;
  isPrivate: boolean;
}

@injectable()
export class InitRemoteRepositoryUseCase {
  constructor(
    @inject('IGitPrService')
    private readonly gitPrService: IGitPrService,
    @inject('IToolInstallerService')
    private readonly toolInstaller: IToolInstallerService
  ) {}

  async execute(input: InitRemoteInput): Promise<InitRemoteResult> {
    // 1. Check gh CLI availability
    const ghStatus = await this.toolInstaller.checkAvailability('gh');
    if (ghStatus.status !== 'available') {
      throw new GitPrError(
        'gh CLI is not installed. Install it with: brew install gh (macOS) or see https://cli.github.com/',
        GitPrErrorCode.GH_NOT_FOUND
      );
    }

    // 2. Guard against existing remote
    const hasRemote = await this.gitPrService.hasRemote(input.cwd);
    if (hasRemote) {
      throw new GitPrError(
        'A remote is already configured for this repository. Use `git remote -v` to view existing remotes.',
        GitPrErrorCode.REMOTE_ALREADY_EXISTS
      );
    }

    // 3. Derive repo name from cwd basename if not provided
    const repoName = input.name ?? basename(input.cwd.replace(/\\/g, '/'));
    const isPrivate = !input.isPublic;

    // 4. Create GitHub repo (atomic: creates repo + adds remote + pushes)
    const repoUrl = await this.gitPrService.createGitHubRepo(input.cwd, repoName, {
      isPrivate,
      org: input.org,
    });

    return {
      repoUrl,
      repoName,
      isPrivate,
    };
  }
}
