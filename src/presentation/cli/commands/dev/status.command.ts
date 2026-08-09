/**
 * `shep dev status`
 *
 * Report the current lifecycle state of a target's dev server, plus what it is
 * (or would be) running: the resolved run plan's command and expected port.
 *
 * Both facts come from use cases — the state from `GetDeploymentStatusUseCase`,
 * the plan from `GetDevServerRunPlanUseCase` (which also derives `isStale`).
 */

import { Command } from 'commander';

import type { GetDeploymentStatusUseCase } from '@/application/use-cases/deployments/get-deployment-status.use-case.js';
import type {
  GetDevServerRunPlanResult,
  GetDevServerRunPlanUseCase,
} from '@/application/use-cases/deployments/get-dev-server-run-plan.use-case.js';
import { DevServerRunPlanStatus } from '@/application/use-cases/deployments/dev-server-run-plan-vocabulary.js';
import { container } from '@/infrastructure/di/container.js';

import { getCliI18n } from '../../i18n.js';
import { colors, messages } from '../../ui/index.js';
import { sourceLabel } from './plan-format.js';
import { resolveDevTarget, withTargetOptions, type DevTargetOptions } from './target.js';

interface DevStatusOptions extends DevTargetOptions {
  json?: boolean;
}

function line(label: string, value: string): string {
  return `  ${colors.muted(`${label.padEnd(10)}:`)} ${value}\n`;
}

export function createDevStatusCommand(): Command {
  const t = getCliI18n().t;

  return withTargetOptions(
    new Command('status').description(t('cli:commands.dev.status.description'))
  )
    .option('--json', t('cli:commands.dev.options.json'))
    .action(async (options: DevStatusOptions) => {
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
        const planResult: GetDevServerRunPlanResult = await container
          .resolve<GetDevServerRunPlanUseCase>('GetDevServerRunPlanUseCase')
          .execute({ targetType: target.targetType, targetId: target.targetId });
        const plan = planResult.status === DevServerRunPlanStatus.Ok ? planResult.plan : null;

        if (options.json) {
          process.stdout.write(`${JSON.stringify({ target, status, plan }, null, 2)}\n`);
          return;
        }

        const dash = colors.muted('—');
        process.stdout.write(`\n${t('cli:commands.dev.status.title')}\n\n`);
        let out = '';
        out += line(
          t('cli:commands.dev.status.targetLabel'),
          `${target.targetType} ${target.targetId}`
        );
        out += line(t('cli:commands.dev.status.pathLabel'), target.repoPath);
        out += line(
          t('cli:commands.dev.status.stateLabel'),
          status ? status.state : colors.muted(t('cli:commands.dev.status.notRunning'))
        );
        out += line(t('cli:commands.dev.status.urlLabel'), status?.url ?? dash);
        out += line(
          t('cli:commands.dev.status.commandLabel'),
          plan ? colors.accent(plan.command) : dash
        );
        out += line(
          t('cli:commands.dev.status.portLabel'),
          plan?.expectedPort === undefined ? dash : String(plan.expectedPort)
        );
        out += line(
          t('cli:commands.dev.status.planSourceLabel'),
          plan ? sourceLabel(plan.source) : dash
        );
        process.stdout.write(out);

        if (plan?.isStale) {
          process.stdout.write(`\n  ${colors.warning(t('cli:commands.dev.plan.staleHint'))}\n`);
        }
        process.stdout.write('\n');
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.dev.status.failed'), err);
        process.exitCode = 1;
      }
    });
}
