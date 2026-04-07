/**
 * Init Remote Repository Use Case
 *
 * Orchestrates creating a GitHub repository from a local repo that has
 * no remote yet. Uses `gh repo create` with `--source=.` to create the
 * remote repo, configure the origin remote, and push the current branch.
 */

import { injectable, inject } from 'tsyringe';
import { basename } from 'node:path';
import {
  GitPrError,
  GitPrErrorCode,
  type IGitPrService,
} from '../../ports/output/services/git-pr-service.interface.js';

export interface InitRemoteRepositoryInput {
  /** Working directory of the local repository */
  cwd: string;
  /** Repository name (defaults to directory basename) */
  name?: string;
  /** Whether to create a private repository (default: true) */
  isPrivate?: boolean;
  /** GitHub organization to create the repo under */
  org?: string;
}

export interface InitRemoteRepositoryResult {
  /** URL of the created GitHub repository */
  url: string;
  /** Name used for the repository */
  name: string;
}

@injectable()
export class InitRemoteRepositoryUseCase {
  constructor(
    @inject('IGitPrService')
    private readonly gitPrService: IGitPrService
  ) {}

  async execute(input: InitRemoteRepositoryInput): Promise<InitRemoteRepositoryResult> {
    // 1. Guard: check if the repo already has a remote
    const hasRemote = await this.gitPrService.hasRemote(input.cwd);
    if (hasRemote) {
      const existingUrl = await this.gitPrService.getRemoteUrl(input.cwd);
      throw new GitPrError(
        `Repository already has a remote configured${existingUrl ? ` (${existingUrl})` : ''}. ` +
          'Use `git remote set-url origin <url>` to change it.',
        GitPrErrorCode.REMOTE_ALREADY_EXISTS
      );
    }

    // 2. Derive repo name from directory if not provided
    const name = input.name ?? basename(input.cwd);

    // 3. Create the GitHub repo (also adds origin remote and pushes)
    const url = await this.gitPrService.createGitHubRepo(input.cwd, name, {
      isPrivate: input.isPrivate ?? true,
      org: input.org,
    });

    return { url, name };
  }
}
