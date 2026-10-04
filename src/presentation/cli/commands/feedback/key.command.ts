/** shep feedback key create | ls | revoke (spec 127). */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ManageFeedbackKeysUseCase } from '@/application/use-cases/feedback/manage-feedback-keys.use-case.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runCommand } from '../command-result.js';

export const FAILED = 'cli:commands.feedback.failed';
const FEEDBACK_PATH = '/api/feedback';

function createCreateCommand(): Command {
  const t = getCliI18n().t;
  return new Command('create')
    .description(t('cli:commands.feedback.key.create.description'))
    .requiredOption('-n, --name <name>', t('cli:commands.feedback.key.create.nameOption'))
    .option('-s, --space <space>', t('cli:commands.feedback.spaceOption'))
    .action((options: { name: string; space?: string }) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ManageFeedbackKeysUseCase).create({
          name: options.name,
          ...(options.space ? { space: options.space } : {}),
        });
        report(result, ({ key, secret }) => {
          messages.success(t('cli:commands.feedback.key.create.success', { name: key.name }));
          messages.info(secret);
          messages.info(t('cli:commands.feedback.key.create.once', { path: FEEDBACK_PATH }));
        });
      })
    );
}

function createLsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ls')
    .description(t('cli:commands.feedback.key.ls.description'))
    .option('-s, --space <space>', t('cli:commands.feedback.spaceOption'))
    .action((options: { space?: string }) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ManageFeedbackKeysUseCase).list(options.space);
        report(result, ({ keys }) =>
          renderListView({
            title: t('cli:commands.feedback.key.ls.title'),
            columns: [
              { label: t('cli:commands.feedback.key.ls.idColumn'), width: 38 },
              { label: t('cli:commands.feedback.key.ls.nameColumn'), width: 20 },
              { label: t('cli:commands.feedback.key.ls.prefixColumn'), width: 16 },
              { label: t('cli:commands.feedback.key.ls.usedColumn'), width: 26 },
            ],
            rows: keys.map((key) => [
              colors.muted(key.id),
              key.name,
              `${key.prefix}…`,
              key.revokedAt
                ? colors.error(t('cli:commands.feedback.key.ls.revoked'))
                : (key.lastUsedAt?.toISOString() ??
                  colors.muted(t('cli:commands.feedback.key.ls.never'))),
            ]),
            emptyMessage: t('cli:commands.feedback.key.ls.empty'),
          })
        );
      })
    );
}

function createRevokeCommand(): Command {
  const t = getCliI18n().t;
  return new Command('revoke')
    .description(t('cli:commands.feedback.key.revoke.description'))
    .argument('<key>', t('cli:commands.feedback.key.keyArg'))
    .action((id: string) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ManageFeedbackKeysUseCase).revoke(id);
        report(result, () =>
          messages.success(t('cli:commands.feedback.key.revoke.success', { id }))
        );
      })
    );
}

export function createKeyCommand(): Command {
  return new Command('key')
    .description(getCliI18n().t('cli:commands.feedback.key.description'))
    .addCommand(createCreateCommand())
    .addCommand(createLsCommand())
    .addCommand(createRevokeCommand());
}
