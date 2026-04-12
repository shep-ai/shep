/**
 * Repo Init-Remote Command
 *
 * Creates a GitHub repository from a local repo that has no remote,
 * configures the origin remote, and pushes the current branch.
 *
 * Usage:
 *   shep repo init-remote              # Private repo, name from cwd basename
 *   shep repo init-remote my-project   # Explicit repo name
 *   shep repo init-remote --public     # Public repo
 *   shep repo init-remote --org myorg  # Create under an organization
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { InitRemoteRepositoryUseCase } from '@/application/use-cases/repositories/init-remote-repository.use-case.js';
import { messages, colors } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

export function createInitRemoteCommand(): Command {
  const t = getCliI18n().t;
  return new Command('init-remote')
    .description(t('cli:commands.repo.initRemote.description'))
    .argument('[name]', t('cli:commands.repo.initRemote.nameArgument'))
    .option('--public', t('cli:commands.repo.initRemote.publicOption'))
    .option('--org <name>', t('cli:commands.repo.initRemote.orgOption'))
    .action(async (name: string | undefined, options: { public?: boolean; org?: string }) => {
      try {
        const useCase = container.resolve(InitRemoteRepositoryUseCase);
        const cwd = process.cwd();

        const result = await useCase.execute({
          cwd,
          name,
          isPrivate: !options.public,
          org: options.org,
        });

        messages.success(t('cli:commands.repo.initRemote.created', { name: result.name }));
        console.log(
          `  ${colors.muted(t('cli:commands.repo.initRemote.urlLabel'))} ${colors.accent(result.url)}`
        );
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.repo.initRemote.failed'), err);
        process.exitCode = 1;
      }
    });
}
