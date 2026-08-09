/**
 * `shep dev stop`
 *
 * Stop the local dev server for a target. Graceful shutdown
 * (SIGTERM → SIGKILL) is the deployment service's job; this command only
 * resolves the target and reports what it found.
 */

import { Command } from 'commander';

import type { GetDeploymentStatusUseCase } from '@/application/use-cases/deployments/get-deployment-status.use-case.js';
import type { StopDeploymentUseCase } from '@/application/use-cases/deployments/stop-deployment.use-case.js';
import { container } from '@/infrastructure/di/container.js';

import { getCliI18n } from '../../i18n.js';
import { messages } from '../../ui/index.js';
import { resolveDevTarget, withTargetOptions, type DevTargetOptions } from './target.js';

export function createDevStopCommand(): Command {
  const t = getCliI18n().t;

  return withTargetOptions(
    new Command('stop').description(t('cli:commands.dev.stop.description'))
  ).action(async (options: DevTargetOptions) => {
    const resolved = await resolveDevTarget(options);
    if ('error' in resolved) {
      messages.error(resolved.error);
      process.exitCode = 1;
      return;
    }
    const { target } = resolved;

    try {
      const status = await container
        .resolve<GetDeploymentStatusUseCase>('GetDeploymentStatusUseCase')
        .execute(target.targetId);
      if (!status) {
        messages.info(t('cli:commands.dev.stop.notRunning', { path: target.repoPath }));
        return;
      }

      await container
        .resolve<StopDeploymentUseCase>('StopDeploymentUseCase')
        .execute(target.targetId);
      messages.success(t('cli:commands.dev.stop.stopped', { path: target.repoPath }));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      messages.error(t('cli:commands.dev.stop.failed'), err);
      process.exitCode = 1;
    }
  });
}
