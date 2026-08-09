/**
 * `shep dev start`
 *
 * Start the local dev server for an application, feature or repository and
 * stream the run until it is ready.
 *
 * Fire-and-track (FR-22): the start use case returns as soon as the agentic
 * dev-server run is ACCEPTED — not when the server is up — and everything
 * after that is observation. The command then streams the lifecycle
 * (Analyzing → Installing → Booting → Ready) and the deployment's own output
 * until the server is ready, the run fails, or the user detaches with Ctrl-C.
 */

import { Command } from 'commander';

import type { StartApplicationDeploymentUseCase } from '@/application/use-cases/deployments/start-application-deployment.use-case.js';
import type { StartFeatureDeploymentUseCase } from '@/application/use-cases/deployments/start-feature-deployment.use-case.js';
import type { StartRepositoryDeploymentUseCase } from '@/application/use-cases/deployments/start-repository-deployment.use-case.js';
import type { ResolvedDeploymentTarget } from '@/application/services/deployment-target-resolver.js';
import { DeploymentTargetType } from '@/domain/generated/output.js';
import { container } from '@/infrastructure/di/container.js';

import { getCliI18n } from '../../i18n.js';
import { colors, messages } from '../../ui/index.js';
import { ALL_LINES, DevStreamOutcome, flushOutput, followDeployment } from './stream.js';
import { resolveDevTarget, withTargetOptions, type DevTargetOptions } from './target.js';

/** Launch the run through the use case that owns the target's validation. */
async function acceptRun(target: ResolvedDeploymentTarget): Promise<void> {
  switch (target.targetType) {
    case DeploymentTargetType.Application:
      await container
        .resolve<StartApplicationDeploymentUseCase>('StartApplicationDeploymentUseCase')
        .execute({ applicationId: target.targetId });
      return;
    case DeploymentTargetType.Feature:
      await container
        .resolve<StartFeatureDeploymentUseCase>('StartFeatureDeploymentUseCase')
        .execute(target.targetId);
      return;
    default:
      await container
        .resolve<StartRepositoryDeploymentUseCase>('StartRepositoryDeploymentUseCase')
        .execute(target.repoPath);
  }
}

export function createDevStartCommand(): Command {
  const t = getCliI18n().t;

  return withTargetOptions(
    new Command('start').description(t('cli:commands.dev.start.description'))
  ).action(async (options: DevTargetOptions) => {
    const resolved = await resolveDevTarget(options);
    if ('error' in resolved) {
      messages.error(resolved.error);
      process.exitCode = 1;
      return;
    }
    const { target } = resolved;

    try {
      await acceptRun(target);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      messages.error(t('cli:commands.dev.start.failedToStart'), err);
      process.exitCode = 1;
      return;
    }

    process.stdout.write(
      `\n${t('cli:commands.dev.start.streaming', {
        targetType: target.targetType,
        path: colors.accent(target.repoPath),
      })}\n\n`
    );

    const result = await followDeployment({
      targetId: target.targetId,
      tail: ALL_LINES,
      showStates: true,
      stopWhenReady: true,
    });

    switch (result.outcome) {
      case DevStreamOutcome.Ready:
        messages.success(
          t('cli:commands.dev.start.ready', { url: result.url ?? t('cli:commands.dev.noUrl') })
        );
        break;
      case DevStreamOutcome.Interrupted:
        messages.info(t('cli:commands.dev.start.detached'));
        break;
      default:
        messages.error(
          t('cli:commands.dev.start.notReady', {
            reason: result.failureReason ?? t('cli:commands.dev.start.noReason'),
          })
        );
        process.exitCode = 1;
    }

    // The deployment service holds piped handles on the spawned dev server, so
    // the event loop would stay alive for as long as that server runs.
    await flushOutput();
    process.exit(process.exitCode ?? 0);
  });
}
