/**
 * shep connection add <linear|jira> — connect a tracker account (spec 122).
 *
 * The API key or token is prompted for (hidden), or read from the environment
 * variable named by --secret-env. It is never a command-line argument, so it
 * never lands in shell history or process listings.
 */

import { Command } from 'commander';
import { password } from '@inquirer/prompts';
import { container } from '@/infrastructure/di/container.js';
import { ManageTrackerConnectionsUseCase } from '@/application/use-cases/trackers/manage-tracker-connections.use-case.js';
import { TrackerProvider } from '@/domain/generated/output.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runCommand } from '../command-result.js';

const PROVIDERS: Record<string, TrackerProvider> = {
  linear: TrackerProvider.Linear,
  jira: TrackerProvider.Jira,
};

interface AddOptions {
  name: string;
  space?: string;
  site?: string;
  email?: string;
  secretEnv?: string;
}

export function createAddCommand(): Command {
  const t = getCliI18n().t;
  return new Command('add')
    .description(t('cli:commands.connection.add.description'))
    .argument('<provider>', t('cli:commands.connection.add.providerArg'))
    .requiredOption('-n, --name <name>', t('cli:commands.connection.add.nameOption'))
    .option('-s, --space <space>', t('cli:commands.connection.add.spaceOption'))
    .option('--site <url>', t('cli:commands.connection.add.siteOption'))
    .option('--email <email>', t('cli:commands.connection.add.emailOption'))
    .option('--secret-env <variable>', t('cli:commands.connection.add.secretEnvOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep connection add linear --name "Acme Linear" --space acme
  $ shep connection add jira --name "Acme Jira" --site https://acme.atlassian.net --email me@acme.com
  $ LINEAR_KEY=... shep connection add linear --name CI --secret-env LINEAR_KEY`
    )
    .action((providerName: string, options: AddOptions) =>
      runCommand('cli:commands.connection.failed', async () => {
        const provider = PROVIDERS[providerName.toLowerCase()];
        if (!provider) {
          messages.error(t('cli:commands.connection.add.badProvider', { provider: providerName }));
          process.exitCode = 1;
          return;
        }
        let secret: string;
        if (options.secretEnv) {
          secret = process.env[options.secretEnv] ?? '';
          if (!secret) {
            messages.error(
              t('cli:commands.connection.add.emptyEnv', { variable: options.secretEnv })
            );
            process.exitCode = 1;
            return;
          }
        } else {
          secret = await password({
            message: t(
              provider === TrackerProvider.Linear
                ? 'cli:commands.connection.add.linearPrompt'
                : 'cli:commands.connection.add.jiraPrompt'
            ),
            mask: '*',
          });
        }
        const result = await container.resolve(ManageTrackerConnectionsUseCase).create({
          provider,
          name: options.name,
          ...(options.space ? { space: options.space } : {}),
          ...(options.site ? { siteUrl: options.site } : {}),
          ...(options.email ? { accountEmail: options.email } : {}),
          secret,
        });
        report(result, ({ connection }) =>
          messages.success(
            t('cli:commands.connection.add.success', {
              name: connection.name,
              slug: connection.slug,
              account: connection.accountName ?? '',
            })
          )
        );
      })
    );
}
