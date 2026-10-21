/**
 * Repo Add Command
 *
 * Import a GitHub repository by URL or interactively browse user's repos.
 *
 * Usage:
 *   shep repo add                       # Interactive wizard
 *   shep repo add --url owner/repo      # Direct import by URL
 *   shep repo add --url <url> --dest /path  # Override clone destination
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { getSettings } from '@/infrastructure/services/settings.service.js';
import { ImportGitHubRepositoryUseCase } from '@/application/use-cases/repositories/import-github-repository.use-case.js';
import { ListGitHubRepositoriesUseCase } from '@/application/use-cases/repositories/list-github-repositories.use-case.js';
import { ListGitHubOrganizationsUseCase } from '@/application/use-cases/repositories/list-github-organizations.use-case.js';
import type { IGitHubRepositoryService } from '@/application/ports/output/services/github-repository-service.interface.js';
import {
  GitHubAuthError,
  GitHubCloneError,
  GitHubUrlParseError,
} from '@/application/ports/output/services/github-repository-service.interface.js';
import { messages } from '../../ui/index.js';
import { githubImportWizard } from '../../../tui/wizards/github-import.wizard.js';
import { getCliI18n } from '../../i18n.js';

export function createAddCommand(): Command {
  const t = getCliI18n().t;
  return new Command('add')
    .description(t('cli:commands.repo.add.description'))
    .option('--url <url>', t('cli:commands.repo.add.urlOption'))
    .option('--dest <path>', t('cli:commands.repo.add.destOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep repo add
  $ shep repo add --url acme/shop
  $ shep repo add --url https://github.com/acme/shop --dest ~/src/shop`
    )
    .action(async (options: { url?: string; dest?: string }) => {
      try {
        const importUseCase = container.resolve(ImportGitHubRepositoryUseCase);

        let url: string;
        let dest: string | undefined = options.dest;

        if (options.url) {
          url = options.url;
        } else {
          // Interactive wizard
          const gitHubService = container.resolve<IGitHubRepositoryService>(
            'IGitHubRepositoryService'
          );
          const listUseCase = container.resolve(ListGitHubRepositoriesUseCase);
          const listOrgsUseCase = container.resolve(ListGitHubOrganizationsUseCase);
          const wizardResult = await githubImportWizard(
            gitHubService,
            listUseCase,
            listOrgsUseCase
          );
          url = wizardResult.url;
          if (!dest && wizardResult.dest) {
            dest = wizardResult.dest;
          }
        }

        // Read default clone directory from settings
        const settings = getSettings();
        const defaultCloneDir = settings.environment?.defaultCloneDirectory;

        const repository = await importUseCase.execute({
          url,
          dest,
          defaultCloneDir,
        });

        messages.success(t('cli:commands.repo.add.importSuccess', { name: repository.name }));
        messages.info(t('cli:commands.repo.add.pathInfo', { path: repository.path }));
      } catch (error) {
        if (error instanceof GitHubAuthError) {
          messages.error(t('cli:commands.repo.add.authError'));
          process.exitCode = 1;
          return;
        }
        if (error instanceof GitHubUrlParseError) {
          messages.error(t('cli:commands.repo.add.invalidUrl', { error: error.message }));
          messages.info(t('cli:commands.repo.add.supportedFormats'));
          process.exitCode = 1;
          return;
        }
        if (error instanceof GitHubCloneError) {
          messages.error(t('cli:commands.repo.add.cloneFailed', { error: error.message }));
          process.exitCode = 1;
          return;
        }

        // Handle Ctrl+C gracefully
        if (
          error &&
          typeof error === 'object' &&
          'name' in error &&
          error.name === 'ExitPromptError'
        ) {
          return;
        }

        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.repo.add.failedToImport'), err);
        process.exitCode = 1;
      }
    });
}
