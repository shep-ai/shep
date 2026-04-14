/**
 * `shep app git create-remote <id>`
 *
 * Thin wrapper over CreateGitRemoteUseCase. If gh is not signed in,
 * delegates to the github-login flow (same use case chain the web UI
 * uses on 409 GH_NOT_AUTHENTICATED).
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { CreateGitRemoteUseCase } from '@/application/use-cases/cloud-deploy/create-git-remote.use-case.js';
import { EnsureGhAuthenticatedUseCase } from '@/application/use-cases/cloud-deploy/ensure-gh-authenticated.use-case.js';
import { GhNotAuthenticatedError } from '@/domain/errors/gh-not-authenticated.error.js';
import { messages, colors } from '../../../ui/index.js';
import { resolveApplication } from '../resolve-application.js';

export function createGitCreateRemoteCommand(): Command {
  return new Command('create-remote')
    .description('Create a GitHub repository for the application and push')
    .argument('<id>', 'Application id or slug')
    .action(async (id: string) => {
      try {
        const resolved = await resolveApplication(id);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }

        const ghCheck = container.resolve(EnsureGhAuthenticatedUseCase);
        const { authenticated } = await ghCheck.execute();
        if (!authenticated) {
          messages.error(
            'gh CLI is not authenticated. Run `shep app cloud-providers github-login` first.'
          );
          process.exitCode = 2;
          return;
        }

        const useCase = container.resolve(CreateGitRemoteUseCase);
        const result = await useCase.execute(resolved.application.id);
        process.stdout.write(colors.success(`\n✓ Repository created: ${result.remoteUrl}\n`));
      } catch (error) {
        if (error instanceof GhNotAuthenticatedError) {
          messages.error(
            'GitHub CLI authentication required. Run `shep app cloud-providers github-login` first.'
          );
          process.exitCode = 2;
          return;
        }
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to create GitHub repository', err);
        process.exitCode = 1;
      }
    });
}
