/**
 * `shep dev plan show | set | clear`
 *
 * The inspect/override/re-analyze surface for a dev-server run plan, over the
 * same three use cases the web disclosure calls.
 *
 * The CLI decides nothing here. `isStale` arrives already derived (FR-13),
 * override validation happens inside the use case (FR-19), and the refusal for
 * a repository controlled by a committed `.shep/dev.json` is a typed result
 * rather than something this layer works out for itself.
 */

import { Command } from 'commander';

import type { ResolvedDeploymentTarget } from '@/application/services/deployment-target-resolver.js';
import { DevServerRunPlanStatus } from '@/application/use-cases/deployments/dev-server-run-plan-vocabulary.js';
import type { GetDevServerRunPlanUseCase } from '@/application/use-cases/deployments/get-dev-server-run-plan.use-case.js';
import type { InvalidateDevServerRunPlanUseCase } from '@/application/use-cases/deployments/invalidate-dev-server-run-plan.use-case.js';
import type {
  OverrideDevServerRunPlanInput,
  OverrideDevServerRunPlanUseCase,
} from '@/application/use-cases/deployments/override-dev-server-run-plan.use-case.js';
import { container } from '@/infrastructure/di/container.js';

import { getCliI18n } from '../../i18n.js';
import { colors, messages } from '../../ui/index.js';
import { printRunPlan, sourceLabel } from './plan-format.js';
import { resolveDevTarget, withTargetOptions, type DevTargetOptions } from './target.js';

/**
 * Sentinel that clears an optional field, mirroring the use case's
 * "omitted keeps it, null clears it" convention on the command line.
 */
const CLEAR_VALUE = 'none';

interface PlanShowOptions extends DevTargetOptions {
  json?: boolean;
}

interface PlanSetOptions extends DevTargetOptions {
  command?: string;
  cwd?: string;
  port?: string;
  language?: string;
  framework?: string;
  packageManager?: string;
  setup?: string[];
  clearSetup?: boolean;
}

/** `none` clears the field; anything else sets it; absent keeps it. */
function optional(raw: string | undefined): string | null | undefined {
  if (raw === undefined) return undefined;
  return raw === CLEAR_VALUE ? null : raw;
}

/**
 * Parse `--port`. A non-numeric value is passed through as `NaN` on purpose so
 * the range check stays in the use case rather than being duplicated here.
 */
function optionalPort(raw: string | undefined): number | null | undefined {
  if (raw === undefined) return undefined;
  return raw === CLEAR_VALUE ? null : Number(raw);
}

/** Spread helper: an omitted flag must not appear in the input at all. */
function entry<K extends string, V>(key: K, value: V | undefined): Record<K, V> | object {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function buildOverrideInput(
  target: ResolvedDeploymentTarget,
  options: PlanSetOptions
): OverrideDevServerRunPlanInput {
  return {
    targetType: target.targetType,
    targetId: target.targetId,
    ...entry('command', options.command),
    ...entry('cwd', options.cwd),
    ...entry('expectedPort', optionalPort(options.port)),
    ...entry('language', optional(options.language)),
    ...entry('framework', optional(options.framework)),
    ...entry('packageManager', optional(options.packageManager)),
    ...entry('setupCommands', options.clearSetup ? [] : options.setup),
  };
}

function createPlanShowCommand(): Command {
  const t = getCliI18n().t;

  return withTargetOptions(
    new Command('show').description(t('cli:commands.dev.plan.show.description'))
  )
    .option('--json', t('cli:commands.dev.options.json'))
    .action(async (options: PlanShowOptions) => {
      const resolved = await resolveDevTarget(options);
      if ('error' in resolved) {
        messages.error(resolved.error);
        process.exitCode = 1;
        return;
      }
      const { target } = resolved;

      try {
        const result = await container
          .resolve<GetDevServerRunPlanUseCase>('GetDevServerRunPlanUseCase')
          .execute({ targetType: target.targetType, targetId: target.targetId });

        if (options.json) {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
          return;
        }

        if (result.status === DevServerRunPlanStatus.NoPlan) {
          messages.info(t('cli:commands.dev.plan.show.empty', { path: result.repoPath }));
          if (result.repoConfigControlled) {
            messages.warning(t('cli:commands.dev.plan.repoConfigControlled'));
          }
          return;
        }
        if (result.status !== DevServerRunPlanStatus.Ok) {
          messages.error(result.message);
          process.exitCode = 1;
          return;
        }

        process.stdout.write(`\n${t('cli:commands.dev.plan.show.title')}\n\n`);
        printRunPlan(result.plan);
        if (result.repoConfigControlled) {
          process.stdout.write(
            `\n  ${colors.warning(t('cli:commands.dev.plan.repoConfigControlled'))}\n`
          );
        }
        process.stdout.write('\n');
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.dev.plan.show.failed'), err);
        process.exitCode = 1;
      }
    });
}

function createPlanSetCommand(): Command {
  const t = getCliI18n().t;

  return withTargetOptions(
    new Command('set').description(t('cli:commands.dev.plan.set.description'))
  )
    .option('-c, --command <command>', t('cli:commands.dev.plan.set.commandOption'))
    .option('--cwd <dir>', t('cli:commands.dev.plan.set.cwdOption'))
    .option('--port <port>', t('cli:commands.dev.plan.set.portOption'))
    .option('--language <language>', t('cli:commands.dev.plan.set.languageOption'))
    .option('--framework <framework>', t('cli:commands.dev.plan.set.frameworkOption'))
    .option('--package-manager <manager>', t('cli:commands.dev.plan.set.packageManagerOption'))
    .option('--setup <command...>', t('cli:commands.dev.plan.set.setupOption'))
    .option('--clear-setup', t('cli:commands.dev.plan.set.clearSetupOption'))
    .action(async (options: PlanSetOptions) => {
      const resolved = await resolveDevTarget(options);
      if ('error' in resolved) {
        messages.error(resolved.error);
        process.exitCode = 1;
        return;
      }
      const { target } = resolved;

      try {
        const result = await container
          .resolve<OverrideDevServerRunPlanUseCase>('OverrideDevServerRunPlanUseCase')
          .execute(buildOverrideInput(target, options));

        switch (result.status) {
          case DevServerRunPlanStatus.Ok:
            process.stdout.write(`\n${t('cli:commands.dev.plan.set.saved')}\n\n`);
            printRunPlan(result.plan);
            process.stdout.write(
              `\n  ${colors.muted(
                t('cli:commands.dev.plan.set.executionNotice', {
                  source: sourceLabel(result.plan.source),
                })
              )}\n\n`
            );
            return;
          case DevServerRunPlanStatus.RepoConfigControlled:
            messages.error(result.message);
            process.exitCode = 1;
            return;
          case DevServerRunPlanStatus.ValidationFailed:
            messages.error(t('cli:commands.dev.plan.set.invalid'));
            for (const error of result.errors) {
              process.stdout.write(`  ${colors.error(`${error.field}:`)} ${error.message}\n`);
            }
            process.exitCode = 1;
            return;
          default:
            messages.error(result.message);
            process.exitCode = 1;
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.dev.plan.set.failed'), err);
        process.exitCode = 1;
      }
    });
}

function createPlanClearCommand(): Command {
  const t = getCliI18n().t;

  return withTargetOptions(
    new Command('clear').description(t('cli:commands.dev.plan.clear.description'))
  ).action(async (options: DevTargetOptions) => {
    const resolved = await resolveDevTarget(options);
    if ('error' in resolved) {
      messages.error(resolved.error);
      process.exitCode = 1;
      return;
    }
    const { target } = resolved;

    try {
      const result = await container
        .resolve<InvalidateDevServerRunPlanUseCase>('InvalidateDevServerRunPlanUseCase')
        .execute({ targetType: target.targetType, targetId: target.targetId });

      if (result.status === DevServerRunPlanStatus.NoPlan) {
        messages.info(t('cli:commands.dev.plan.clear.empty', { path: result.repoPath }));
      } else if (result.status === DevServerRunPlanStatus.Ok) {
        messages.success(
          t('cli:commands.dev.plan.clear.cleared', { source: sourceLabel(result.clearedSource) })
        );
      } else {
        messages.error(result.message);
        process.exitCode = 1;
        return;
      }

      if (result.message) {
        messages.warning(result.message);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      messages.error(t('cli:commands.dev.plan.clear.failed'), err);
      process.exitCode = 1;
    }
  });
}

export function createDevPlanCommand(): Command {
  const t = getCliI18n().t;

  return new Command('plan')
    .description(t('cli:commands.dev.plan.description'))
    .addCommand(createPlanShowCommand())
    .addCommand(createPlanSetCommand())
    .addCommand(createPlanClearCommand());
}
