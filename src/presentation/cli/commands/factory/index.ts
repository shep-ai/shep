/**
 * Factory Command Group (spec 132)
 *
 * Usage:
 *   shep factory status [--space]
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetFactoryStatusUseCase } from '@/application/use-cases/autopilot/get-factory-status.use-case.js';
import { isAutopilotOn } from '@/domain/shared/autopilot.js';
import { renderDetailView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runCommand } from '../command-result.js';
import { printPass } from '../autopilot/format-pass.js';

function createStatusCommand(): Command {
  const t = getCliI18n().t;
  return new Command('status')
    .description(t('cli:commands.factory.status.description'))
    .option('-s, --space <space>', t('cli:commands.factory.spaceOption'))
    .action((options: { space?: string }) =>
      runCommand('cli:commands.factory.failed', async () => {
        report(
          await container.resolve(GetFactoryStatusUseCase).execute(options.space),
          ({ status }) => {
            renderDetailView({
              title: t('cli:commands.factory.status.title', { space: status.space.name }),
              sections: [
                {
                  fields: [
                    {
                      label: t('cli:commands.factory.status.line'),
                      value: t('cli:commands.factory.status.lineValue', {
                        used: status.line.usedHours,
                        capacity: status.line.capacityHours,
                        inLine: status.line.inLine,
                        waiting: status.line.waiting,
                      }),
                    },
                    {
                      label: t('cli:commands.factory.status.building'),
                      value: String(status.building),
                    },
                    {
                      label: t('cli:commands.factory.status.features'),
                      value: t('cli:commands.factory.status.featuresValue', {
                        inFlight: status.features.inFlight,
                        waiting: status.features.awaitingApproval,
                      }),
                    },
                    {
                      label: t('cli:commands.factory.status.incidents'),
                      value: String(status.openIncidents),
                    },
                    {
                      label: t('cli:commands.factory.status.actions'),
                      value: String(status.actionsAwaitingApproval),
                    },
                    {
                      label: t('cli:commands.factory.status.outcomes'),
                      value: String(status.pendingOutcomes),
                    },
                    {
                      label: t('cli:commands.factory.status.customers'),
                      value: String(status.customersToTell),
                    },
                    {
                      label: t('cli:commands.factory.status.autopilot'),
                      value: t(
                        isAutopilotOn(status.autopilot.policy)
                          ? 'cli:commands.autopilot.on'
                          : 'cli:commands.autopilot.off'
                      ),
                    },
                  ],
                },
              ],
            });
            if (status.autopilot.lastRun) printPass(status.autopilot.lastRun);
          }
        );
      })
    );
}

export function createFactoryCommand(): Command {
  return new Command('factory')
    .description(getCliI18n().t('cli:commands.factory.description'))
    .addCommand(createStatusCommand());
}
