/**
 * `shep app deploy status <id>`
 *
 * Thin wrapper over GetCloudDeploymentStatusUseCase.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetCloudDeploymentStatusUseCase } from '@/application/use-cases/cloud-deploy/get-cloud-deployment-status.use-case.js';
import { messages, colors } from '../../../ui/index.js';
import { resolveApplication } from '../resolve-application.js';

export function createDeployStatusCommand(): Command {
  return new Command('status')
    .description('Show the latest cloud deployment status for an application')
    .argument('<id>', 'Application id or slug')
    .option('--json', 'Output as JSON')
    .action(async (id: string, options: { json?: boolean }) => {
      try {
        const resolved = await resolveApplication(id);
        if ('error' in resolved) {
          messages.error(resolved.error);
          process.exitCode = 1;
          return;
        }
        const useCase = container.resolve(GetCloudDeploymentStatusUseCase);
        const dto = await useCase.execute(resolved.application.id);

        if (options.json) {
          process.stdout.write(`${JSON.stringify(dto, null, 2)}\n`);
          return;
        }

        process.stdout.write(
          `\nCloud deployment — ${colors.accent(resolved.application.name)}\n\n`
        );
        process.stdout.write(`  provider : ${dto.provider ?? colors.muted('none')}\n`);
        process.stdout.write(`  status   : ${dto.status ?? colors.muted('not deployed')}\n`);
        process.stdout.write(`  url      : ${dto.url ?? colors.muted('—')}\n`);
        process.stdout.write(`  git      : ${dto.gitRemoteUrl ?? colors.muted('no remote')}\n`);
        if (dto.error) {
          process.stdout.write(`  error    : ${colors.error(dto.error)}\n`);
        }
        if (dto.lastDeployedAt) {
          process.stdout.write(`  updated  : ${new Date(dto.lastDeployedAt).toLocaleString()}\n`);
        }
        process.stdout.write('\n');
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to fetch cloud deployment status', err);
        process.exitCode = 1;
      }
    });
}
