/**
 * Repo Init-Remote Command
 *
 * Create a GitHub repository and link it as the origin remote for a local
 * repository that has no remote configured.
 *
 * Usage:
 *   shep repo init-remote [name] [--public] [--org <name>]
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { InitRemoteRepositoryUseCase } from '@/application/use-cases/repositories/init-remote-repository.use-case.js';
import {
  GitPrError,
  GitPrErrorCode,
} from '@/application/ports/output/services/git-pr-service.interface.js';
import { colors, messages } from '../../ui/index.js';

export function createInitRemoteCommand(): Command {
  return new Command('init-remote')
    .description('Create a GitHub repository and configure the local git remote')
    .argument('[name]', 'GitHub repository name (defaults to directory name)')
    .option('--public', 'Create a public repository (default: private)', false)
    .option('--org <name>', 'Create the repository under a GitHub organization')
    .action(async (name: string | undefined, options: { public: boolean; org?: string }) => {
      try {
        const useCase = container.resolve(InitRemoteRepositoryUseCase);
        const result = await useCase.execute({
          cwd: process.cwd(),
          name,
          isPublic: options.public,
          org: options.org,
        });

        const visibility = result.isPrivate ? 'private' : 'public';
        messages.success(`Created ${visibility} repository: ${colors.info(result.repoUrl)}`);
      } catch (error) {
        if (error instanceof GitPrError) {
          switch (error.code) {
            case GitPrErrorCode.REMOTE_ALREADY_EXISTS:
              messages.error('Remote already configured. Use `git remote -v` to view remotes.');
              break;
            case GitPrErrorCode.GH_NOT_FOUND:
              messages.error(
                'gh CLI is not installed. Install it with: brew install gh (macOS) or see https://cli.github.com/'
              );
              break;
            case GitPrErrorCode.AUTH_FAILURE:
              messages.error('gh CLI is not authenticated. Run `gh auth login` to authenticate.');
              break;
            case GitPrErrorCode.REPO_CREATE_FAILED:
              messages.error(`Failed to create GitHub repository: ${error.message}`);
              break;
            default:
              messages.error('Failed to initialize remote repository', error);
              break;
          }
        } else {
          const err = error instanceof Error ? error : new Error(String(error));
          messages.error('Failed to initialize remote repository', err);
        }
        process.exitCode = 1;
      }
    });
}
