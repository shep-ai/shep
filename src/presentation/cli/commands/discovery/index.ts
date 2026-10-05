/**
 * Discovery Command Group (spec 128)
 *
 * An agent reads a space's loose signals and proposes opportunities backed
 * by them.
 *
 * Usage:
 *   shep discovery run [--space] [--agent]
 *   shep discovery ls [--space]
 *   shep discovery schedule [--space] --every <hours> | --off
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import type { AgentType } from '@/domain/generated/output.js';
import { RunDiscoveryUseCase } from '@/application/use-cases/discovery/run-discovery.use-case.js';
import { ListDiscoveryRunsUseCase } from '@/application/use-cases/discovery/list-discovery-runs.use-case.js';
import { ManageOpportunityWeightsUseCase } from '@/application/use-cases/opportunities/manage-opportunity-weights.use-case.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runCommand } from '../command-result.js';
import { parseAgentType } from '../agent-option.js';
import { parseNumberOption } from '../number-option.js';

const FAILED = 'cli:commands.discovery.failed';

function createRunCommand(): Command {
  const t = getCliI18n().t;
  return new Command('run')
    .description(t('cli:commands.discovery.run.description'))
    .option('-s, --space <space>', t('cli:commands.discovery.spaceOption'))
    .option('--agent <type>', t('cli:commands.discovery.run.agentOption'), parseAgentType)
    .action((options: { space?: string; agent?: AgentType }) =>
      runCommand(FAILED, async () => {
        messages.info(t('cli:commands.discovery.run.started'));
        const result = await container.resolve(RunDiscoveryUseCase).execute({
          ...(options.space ? { space: options.space } : {}),
          ...(options.agent ? { agentType: options.agent } : {}),
        });
        report(result, ({ run, opportunities }) => {
          messages.success(
            t('cli:commands.discovery.run.success', {
              read: run.signalsRead,
              proposed: run.proposed,
              dropped: run.dropped,
            })
          );
          for (const opportunity of opportunities) {
            messages.info(`  ${opportunity.title} ${colors.muted(opportunity.id)}`);
          }
        });
      })
    );
}

function createLsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ls')
    .description(t('cli:commands.discovery.ls.description'))
    .option('-s, --space <space>', t('cli:commands.discovery.spaceOption'))
    .action((options: { space?: string }) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ListDiscoveryRunsUseCase).execute(options.space);
        report(result, ({ runs }) =>
          renderListView({
            title: t('cli:commands.discovery.ls.title'),
            columns: [
              { label: t('cli:commands.discovery.ls.whenColumn'), width: 26 },
              { label: t('cli:commands.discovery.ls.statusColumn'), width: 10 },
              { label: t('cli:commands.discovery.ls.resultColumn'), width: 60 },
            ],
            rows: runs.map((run) => [
              run.createdAt.toISOString(),
              run.status,
              run.error
                ? colors.error(run.error)
                : t('cli:commands.discovery.ls.result', {
                    read: run.signalsRead,
                    proposed: run.proposed,
                    dropped: run.dropped,
                  }),
            ]),
            emptyMessage: t('cli:commands.discovery.ls.empty'),
          })
        );
      })
    );
}

function createScheduleCommand(): Command {
  const t = getCliI18n().t;
  return new Command('schedule')
    .description(t('cli:commands.discovery.schedule.description'))
    .option('-s, --space <space>', t('cli:commands.discovery.spaceOption'))
    .option('--every <hours>', t('cli:commands.discovery.schedule.everyOption'))
    .option('--off', t('cli:commands.discovery.schedule.offOption'))
    .action((options: { space?: string; every?: string; off?: boolean }) =>
      runCommand(FAILED, async () => {
        if (!options.off && options.every === undefined) {
          messages.error(t('cli:commands.discovery.schedule.needEvery'));
          process.exitCode = 1;
          return;
        }
        const every = parseNumberOption('--every', options.every);
        if (!every.ok) return;
        const hours = options.off ? null : (every.value ?? null);
        const result = await container
          .resolve(ManageOpportunityWeightsUseCase)
          .setDiscovery(options.space, hours);
        report(result, () =>
          messages.success(
            hours === null
              ? t('cli:commands.discovery.schedule.off')
              : t('cli:commands.discovery.schedule.on', { hours })
          )
        );
      })
    );
}

export function createDiscoveryCommand(): Command {
  return new Command('discovery')
    .description(getCliI18n().t('cli:commands.discovery.description'))
    .addCommand(createRunCommand())
    .addCommand(createLsCommand())
    .addCommand(createScheduleCommand());
}
