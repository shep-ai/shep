/**
 * shep space rule add|ls|rm — rules place repositories in a space by path
 * prefix or git remote pattern. The most specific matching rule wins.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ManageSpaceMembershipUseCase } from '@/application/use-cases/spaces/manage-space-membership.use-case.js';
import { SpaceRuleKind } from '@/domain/generated/output.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { expandHome } from '../../paths.js';
import { report, runSpaceCommand } from './run-space-command.js';

interface AddRuleOptions {
  remote?: boolean;
  line?: string;
  priority?: string;
}

const INTEGER = /^-?\d+$/;

export function createRuleCommand(): Command {
  const t = getCliI18n().t;

  const add = new Command('add')
    .description(t('cli:commands.space.rule.add.description'))
    .argument('<space>', t('cli:commands.space.spaceArg'))
    .argument('<pattern>', t('cli:commands.space.rule.patternArg'))
    .option('--remote', t('cli:commands.space.rule.add.remoteOption'))
    .option('-l, --line <line>', t('cli:commands.space.lineOption'))
    .option('-p, --priority <n>', t('cli:commands.space.rule.add.priorityOption'))
    .action((space: string, rawPattern: string, options: AddRuleOptions) =>
      runSpaceCommand(async () => {
        if (options.priority !== undefined && !INTEGER.test(options.priority.trim())) {
          messages.error(t('cli:commands.space.rule.add.badPriority', { value: options.priority }));
          process.exitCode = 1;
          return;
        }
        const result = await container.resolve(ManageSpaceMembershipUseCase).addRule({
          space,
          // Without --remote the use case infers the kind from the pattern.
          kind: options.remote ? SpaceRuleKind.Remote : undefined,
          pattern: expandHome(rawPattern),
          productLine: options.line,
          priority:
            options.priority === undefined ? undefined : Number.parseInt(options.priority, 10),
        });
        report(result, ({ rule }) =>
          messages.success(
            t('cli:commands.space.rule.add.success', { kind: rule.kind, pattern: rule.pattern })
          )
        );
      })
    );

  const list = new Command('ls')
    .description(t('cli:commands.space.rule.ls.description'))
    .argument('[space]', t('cli:commands.space.spaceArg'))
    .action((space: string | undefined) =>
      runSpaceCommand(async () => {
        const result = await container.resolve(ManageSpaceMembershipUseCase).listRules(space);
        report(result, ({ rules }) =>
          renderListView({
            title: t('cli:commands.space.rule.ls.title'),
            columns: [
              { label: t('cli:commands.space.rule.ls.idColumn'), width: 38 },
              { label: t('cli:commands.space.rule.ls.kindColumn'), width: 8 },
              { label: t('cli:commands.space.rule.ls.patternColumn'), width: 36 },
              { label: t('cli:commands.space.rule.ls.priorityColumn'), width: 8 },
            ],
            rows: rules.map((rule) => [
              colors.muted(rule.id),
              rule.kind,
              rule.pattern,
              String(rule.priority),
            ]),
            emptyMessage: t('cli:commands.space.rule.ls.empty'),
          })
        );
      })
    );

  const remove = new Command('rm')
    .description(t('cli:commands.space.rule.rm.description'))
    .argument('<id>', t('cli:commands.space.rule.idArg'))
    .action((id: string) =>
      runSpaceCommand(async () => {
        const result = await container.resolve(ManageSpaceMembershipUseCase).removeRule(id);
        report(result, () => messages.success(t('cli:commands.space.rule.rm.success')));
      })
    );

  return new Command('rule')
    .description(t('cli:commands.space.rule.description'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep space rule add acme ~/work/acme                  Everything under a folder
  $ shep space rule add acme "github.com/acme/*"          Every repository of a GitHub owner
  $ shep space rule add acme "github.com/acme/pay-*" -l payments
  $ shep space rule ls acme
  $ shep space rule rm <id>`
    )
    .addCommand(add)
    .addCommand(list)
    .addCommand(remove);
}
