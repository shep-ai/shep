/** shep sync rule add | ls | enable | disable | rm (spec 122). */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ManageTrackerSyncRulesUseCase } from '@/application/use-cases/trackers/manage-tracker-sync-rules.use-case.js';
import { TrackerSyncDirection } from '@/domain/generated/output.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runCommand } from '../command-result.js';
import { formatRunSummary } from './format-summary.js';
import { parseEveryOption } from '../every-option.js';

const FAILED = 'cli:commands.sync.failed';

interface AddRuleOptions {
  project: string;
  scope: string;
  twoWay?: boolean;
  every?: string;
}

function createAddRuleCommand(): Command {
  const t = getCliI18n().t;
  return new Command('add')
    .description(t('cli:commands.sync.rule.add.description'))
    .argument('<connection>', t('cli:commands.sync.connectionArg'))
    .requiredOption('-p, --project <project>', t('cli:commands.sync.rule.add.projectOption'))
    .requiredOption('-s, --scope <scope>', t('cli:commands.sync.rule.add.scopeOption'))
    .option('--two-way', t('cli:commands.sync.rule.add.twoWayOption'))
    .option('--every <minutes>', t('cli:commands.sync.rule.add.everyOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep sync rule add acme-linear --project pay --scope ENG
  $ shep sync rule add acme-jira --project pay --scope "project = PAY AND type = Bug" --two-way --every 30`
    )
    .action((connection: string, options: AddRuleOptions) =>
      runCommand(FAILED, async () => {
        const every = parseEveryOption(options.every);
        if (!every.ok) return;
        const result = await container.resolve(ManageTrackerSyncRulesUseCase).create({
          connection,
          project: options.project,
          scope: options.scope,
          direction: options.twoWay ? TrackerSyncDirection.TwoWay : TrackerSyncDirection.Import,
          ...(every.intervalMinutes === undefined
            ? {}
            : { intervalMinutes: every.intervalMinutes }),
        });
        report(result, ({ rule }) =>
          messages.success(
            t('cli:commands.sync.rule.add.success', { id: rule.id, scope: rule.scope })
          )
        );
      })
    );
}

function createLsRuleCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ls')
    .description(t('cli:commands.sync.rule.ls.description'))
    .argument('[connection]', t('cli:commands.sync.connectionArg'))
    .action((connection: string | undefined) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ManageTrackerSyncRulesUseCase).list(connection);
        report(result, ({ rules }) =>
          renderListView({
            title: t('cli:commands.sync.rule.ls.title'),
            columns: [
              { label: t('cli:commands.sync.rule.ls.idColumn'), width: 38 },
              { label: t('cli:commands.sync.rule.ls.fromColumn'), width: 34 },
              { label: t('cli:commands.sync.rule.ls.intoColumn'), width: 14 },
              { label: t('cli:commands.sync.rule.ls.modeColumn'), width: 16 },
              { label: t('cli:commands.sync.rule.ls.lastRunColumn'), width: 40 },
            ],
            rows: rules.map(({ rule, connection: from, project }) => [
              colors.muted(rule.id),
              `${from.slug}: ${rule.scope}`,
              project.slug,
              `${rule.direction} / ${rule.intervalMinutes}m${rule.enabled ? '' : ` ${t('cli:commands.sync.rule.ls.off')}`}`,
              rule.lastError
                ? colors.error(rule.lastError)
                : rule.lastRun
                  ? formatRunSummary(rule.lastRun)
                  : colors.muted(t('cli:commands.sync.rule.ls.never')),
            ]),
            emptyMessage: t('cli:commands.sync.rule.ls.empty'),
          })
        );
      })
    );
}

function createToggleCommand(name: 'enable' | 'disable'): Command {
  const t = getCliI18n().t;
  return new Command(name)
    .description(t(`cli:commands.sync.rule.${name}.description`))
    .argument('<rule>', t('cli:commands.sync.ruleArg'))
    .action((id: string) =>
      runCommand(FAILED, async () => {
        const result = await container
          .resolve(ManageTrackerSyncRulesUseCase)
          .setEnabled(id, name === 'enable');
        report(result, () => messages.success(t(`cli:commands.sync.rule.${name}.success`, { id })));
      })
    );
}

function createRmRuleCommand(): Command {
  const t = getCliI18n().t;
  return new Command('rm')
    .description(t('cli:commands.sync.rule.rm.description'))
    .argument('<rule>', t('cli:commands.sync.ruleArg'))
    .action((id: string) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ManageTrackerSyncRulesUseCase).remove(id);
        report(result, () => messages.success(t('cli:commands.sync.rule.rm.success', { id })));
      })
    );
}

export function createRuleCommand(): Command {
  return new Command('rule')
    .description(getCliI18n().t('cli:commands.sync.rule.description'))
    .addCommand(createAddRuleCommand())
    .addCommand(createLsRuleCommand())
    .addCommand(createToggleCommand('enable'))
    .addCommand(createToggleCommand('disable'))
    .addCommand(createRmRuleCommand());
}
