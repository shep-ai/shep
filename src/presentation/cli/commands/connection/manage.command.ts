/** shep connection ls | test | rm (spec 122). */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ManageConnectionsUseCase } from '@/application/use-cases/connections/manage-connections.use-case.js';
import { ConnectionStatus } from '@/domain/generated/output.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runCommand } from '../command-result.js';

const FAILED = 'cli:commands.connection.failed';

export function createLsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ls').description(t('cli:commands.connection.ls.description')).action(() =>
    runCommand(FAILED, async () => {
      const connections = await container.resolve(ManageConnectionsUseCase).list();
      renderListView({
        title: t('cli:commands.connection.ls.title'),
        columns: [
          { label: t('cli:commands.connection.ls.nameColumn'), width: 22 },
          { label: t('cli:commands.connection.ls.slugColumn'), width: 18 },
          { label: t('cli:commands.connection.ls.providerColumn'), width: 9 },
          { label: t('cli:commands.connection.ls.accountColumn'), width: 22 },
          { label: t('cli:commands.connection.ls.statusColumn'), width: 30 },
        ],
        rows: connections.map((connection) => [
          connection.name,
          colors.muted(connection.slug),
          connection.provider,
          connection.accountName ?? colors.muted('-'),
          connection.status === ConnectionStatus.Connected
            ? colors.success(connection.status)
            : colors.error(`${connection.status}: ${connection.lastError ?? ''}`),
        ]),
        emptyMessage: t('cli:commands.connection.ls.empty'),
      });
    })
  );
}

export function createTestCommand(): Command {
  const t = getCliI18n().t;
  return new Command('test')
    .description(t('cli:commands.connection.test.description'))
    .argument('<connection>', t('cli:commands.connection.connectionArg'))
    .action((ref: string) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ManageConnectionsUseCase).test(ref);
        report(result, ({ connection }) =>
          messages.success(
            t('cli:commands.connection.test.success', {
              name: connection.name,
              account: connection.accountName ?? '',
            })
          )
        );
      })
    );
}

export function createRmCommand(): Command {
  const t = getCliI18n().t;
  return new Command('rm')
    .description(t('cli:commands.connection.rm.description'))
    .argument('<connection>', t('cli:commands.connection.connectionArg'))
    .action((ref: string) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ManageConnectionsUseCase).remove(ref);
        report(result, () => messages.success(t('cli:commands.connection.rm.success', { ref })));
      })
    );
}
