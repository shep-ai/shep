/**
 * Feature Status Command (spec 148)
 *
 * What a feature's agent is doing — working, blocked, waiting, done or
 * failed — why, and what to run next.
 *
 * Usage: shep feat status <id> [--json]
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetAgentActivityUseCase } from '@/application/use-cases/agent-activity/get-agent-activity.use-case.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { renderActivity, singleActivity } from './activity-output.js';

interface StatusOptions {
  json?: boolean;
}

export function createStatusCommand(): Command {
  const t = getCliI18n().t;
  return new Command('status')
    .description(t('cli:commands.feat.status.description'))
    .argument('<id>', t('cli:commands.feat.status.idArgument'))
    .option('--json', t('cli:commands.feat.status.jsonOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep feat status abc12345
  $ shep feat status abc --json`
    )
    .action(async (featureId: string, options: StatusOptions) => {
      try {
        const { activities } = await container
          .resolve(GetAgentActivityUseCase)
          .execute({ featureId });
        const activity = singleActivity(activities, featureId, t);
        if (!activity) return;
        if (options.json) console.log(JSON.stringify(activity, null, 2));
        else renderActivity(activity, t);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.feat.status.failed'), err);
        process.exitCode = 1;
      }
    });
}
