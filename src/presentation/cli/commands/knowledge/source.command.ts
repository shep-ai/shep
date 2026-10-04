/** shep knowledge source add | ls | enable | disable | rm (spec 125). */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ManageKnowledgeSourcesUseCase } from '@/application/use-cases/knowledge/manage-knowledge-sources.use-case.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runCommand } from '../command-result.js';
import { parseEveryOption } from '../every-option.js';
import { formatKnowledgeSummary } from './format-summary.js';

const FAILED = 'cli:commands.knowledge.failed';

interface AddSourceOptions {
  scope: string;
  productLine?: string;
  every?: string;
}

function createAddSourceCommand(): Command {
  const t = getCliI18n().t;
  return new Command('add')
    .description(t('cli:commands.knowledge.source.add.description'))
    .argument('<connection>', t('cli:commands.knowledge.connectionArg'))
    .requiredOption('--scope <link>', t('cli:commands.knowledge.source.add.scopeOption'))
    .option('-l, --product-line <line>', t('cli:commands.knowledge.source.add.productLineOption'))
    .option('--every <minutes>', t('cli:commands.knowledge.source.add.everyOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep knowledge source add acme-notion --scope https://www.notion.so/acme/Engineering-0123456789abcdef0123456789abcdef
  $ shep knowledge source add acme-notion --scope <database link> --product-line payments --every 240`
    )
    .action((connection: string, options: AddSourceOptions) =>
      runCommand(FAILED, async () => {
        const every = parseEveryOption(options.every);
        if (!every.ok) return;
        const result = await container.resolve(ManageKnowledgeSourcesUseCase).create({
          connection,
          scope: options.scope,
          ...(options.productLine ? { productLine: options.productLine } : {}),
          ...(every.intervalMinutes === undefined
            ? {}
            : { intervalMinutes: every.intervalMinutes }),
        });
        report(result, ({ source }) =>
          messages.success(
            t('cli:commands.knowledge.source.add.success', {
              id: source.id,
              title: source.scopeTitle,
            })
          )
        );
      })
    );
}

function createLsSourceCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ls')
    .description(t('cli:commands.knowledge.source.ls.description'))
    .action(() =>
      runCommand(FAILED, async () => {
        const views = await container.resolve(ManageKnowledgeSourcesUseCase).list();
        renderListView({
          title: t('cli:commands.knowledge.source.ls.title'),
          columns: [
            { label: t('cli:commands.knowledge.source.ls.idColumn'), width: 38 },
            { label: t('cli:commands.knowledge.source.ls.fromColumn'), width: 36 },
            { label: t('cli:commands.knowledge.source.ls.documentsColumn'), width: 6 },
            { label: t('cli:commands.knowledge.source.ls.everyColumn'), width: 12 },
            { label: t('cli:commands.knowledge.source.ls.lastRunColumn'), width: 40 },
          ],
          rows: views.map(({ source, connection, documents }) => [
            colors.muted(source.id),
            `${connection.slug}: ${source.scopeTitle}`,
            String(documents),
            `${source.intervalMinutes}m${source.enabled ? '' : ` ${t('cli:commands.knowledge.source.ls.off')}`}`,
            source.lastError
              ? colors.error(source.lastError)
              : source.lastRun
                ? formatKnowledgeSummary(source.lastRun)
                : colors.muted(t('cli:commands.knowledge.source.ls.never')),
          ]),
          emptyMessage: t('cli:commands.knowledge.source.ls.empty'),
        });
      })
    );
}

function createToggleSourceCommand(name: 'enable' | 'disable'): Command {
  const t = getCliI18n().t;
  return new Command(name)
    .description(t(`cli:commands.knowledge.source.${name}.description`))
    .argument('<source>', t('cli:commands.knowledge.sourceArg'))
    .action((id: string) =>
      runCommand(FAILED, async () => {
        const result = await container
          .resolve(ManageKnowledgeSourcesUseCase)
          .setEnabled(id, name === 'enable');
        report(result, () =>
          messages.success(t(`cli:commands.knowledge.source.${name}.success`, { id }))
        );
      })
    );
}

function createRmSourceCommand(): Command {
  const t = getCliI18n().t;
  return new Command('rm')
    .description(t('cli:commands.knowledge.source.rm.description'))
    .argument('<source>', t('cli:commands.knowledge.sourceArg'))
    .action((id: string) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ManageKnowledgeSourcesUseCase).remove(id);
        report(result, () =>
          messages.success(t('cli:commands.knowledge.source.rm.success', { id }))
        );
      })
    );
}

export function createSourceCommand(): Command {
  return new Command('source')
    .description(getCliI18n().t('cli:commands.knowledge.source.description'))
    .addCommand(createAddSourceCommand())
    .addCommand(createLsSourceCommand())
    .addCommand(createToggleSourceCommand('enable'))
    .addCommand(createToggleSourceCommand('disable'))
    .addCommand(createRmSourceCommand());
}
