/**
 * Feature Adopt Command
 *
 * Adopts an existing git branch into Shep's feature tracking system.
 * Creates a worktree (if needed), derives metadata from the branch name,
 * and persists a Feature with lifecycle=Maintain (agent inactive).
 *
 * Usage:
 *   shep feat adopt <branch>
 *   shep feat adopt <branch> -r /path/to/repo
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { AdoptBranchUseCase } from '@/application/use-cases/features/adopt-branch.use-case.js';
import { colors, messages, spinner } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';

export function createAdoptCommand(): Command {
  const t = getCliI18n().t;
  return new Command('adopt')
    .description(t('cli:commands.feat.adopt.description'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep feat adopt <branch>              Adopt a branch into feature tracking
  $ shep feat adopt <branch> -r /path/to/repo   Adopt from a specific repository`
    )
    .argument('<branch>', t('cli:commands.feat.adopt.branchArgument'))
    .option('-r, --repo <path>', t('cli:commands.feat.adopt.repoOption'))
    .action(async (branch: string, options: { repo?: string }) => {
      try {
        const useCase = container.resolve(AdoptBranchUseCase);
        const { feature } = await spinner(t('cli:commands.feat.adopt.spinnerText'), () =>
          useCase.execute({
            branchName: branch,
            repositoryPath: options.repo ?? process.cwd(),
          })
        );

        messages.newline();
        messages.success(t('cli:commands.feat.adopt.branchAdopted'));
        console.log(
          `  ${colors.muted(t('cli:commands.feat.adopt.idLabel'))}        ${colors.accent(feature.id.slice(0, 8))}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.feat.adopt.nameLabel'))}      ${feature.name}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.feat.adopt.branchLabel'))}    ${colors.accent(feature.branch)}`
        );
        console.log(
          `  ${colors.muted(t('cli:commands.feat.adopt.statusLabel'))}    ${feature.lifecycle}`
        );
        if (feature.pr) {
          console.log(
            `  ${colors.muted(t('cli:commands.feat.adopt.prLabel'))}        ${colors.accent(feature.pr.url)} (${feature.pr.status})`
          );
        }
        console.log(
          `  ${colors.muted(t('cli:commands.feat.adopt.worktreeLabel'))}  ${colors.accent(feature.worktreePath ?? '')}`
        );
        messages.newline();
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.feat.adopt.failedToAdopt'), err);
        process.exitCode = 1;
      }
    });
}
