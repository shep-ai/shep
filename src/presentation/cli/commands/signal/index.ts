/**
 * Signal Command Group (spec 126)
 *
 * Evidence of what users need. Link signals to opportunities with
 * `shep opportunity link`.
 *
 * Usage:
 *   shep signal add <title> [--space] [--product-line] [--kind] [--customer] [--revenue]
 *                           [--urgent] [--url] [--detail] [--opportunity]
 *   shep signal ls [--space] [--unlinked]
 *   shep signal rm <signal>
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ManageSignalsUseCase } from '@/application/use-cases/opportunities/manage-signals.use-case.js';
import { SignalKind } from '@/domain/generated/output.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runCommand } from '../command-result.js';
import { parseNumberOption } from '../number-option.js';

const FAILED = 'cli:commands.signal.failed';
const KINDS = new Map(Object.values(SignalKind).map((kind) => [kind.toLowerCase(), kind]));

interface AddOptions {
  space?: string;
  productLine?: string;
  kind?: string;
  customer?: string;
  revenue?: string;
  urgent?: boolean;
  url?: string;
  detail?: string;
  opportunity?: string;
}

function createAddCommand(): Command {
  const t = getCliI18n().t;
  return new Command('add')
    .description(t('cli:commands.signal.add.description'))
    .argument('<title>', t('cli:commands.signal.add.titleArg'))
    .option('-s, --space <space>', t('cli:commands.signal.spaceOption'))
    .option('-l, --product-line <line>', t('cli:commands.signal.add.productLineOption'))
    .option('-k, --kind <kind>', t('cli:commands.signal.add.kindOption'))
    .option('-c, --customer <name>', t('cli:commands.signal.add.customerOption'))
    .option('-r, --revenue <amount>', t('cli:commands.signal.add.revenueOption'))
    .option('-u, --urgent', t('cli:commands.signal.add.urgentOption'))
    .option('--url <url>', t('cli:commands.signal.add.urlOption'))
    .option('-d, --detail <text>', t('cli:commands.signal.add.detailOption'))
    .option('-o, --opportunity <id>', t('cli:commands.signal.add.opportunityOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep signal add "Guest checkout times out" --space acme --customer Globex --revenue 4000 --urgent
  $ shep signal add "Dark mode" --kind feedback --url https://support.acme.com/t/812`
    )
    .action((title: string, options: AddOptions) =>
      runCommand(FAILED, async () => {
        const kind = options.kind ? KINDS.get(options.kind.toLowerCase()) : undefined;
        if (options.kind && !kind) {
          messages.error(t('cli:commands.signal.add.badKind', { kind: options.kind }));
          process.exitCode = 1;
          return;
        }
        const revenue = parseNumberOption('--revenue', options.revenue);
        if (!revenue.ok) return;
        const result = await container.resolve(ManageSignalsUseCase).record({
          title,
          ...(options.space ? { space: options.space } : {}),
          ...(options.productLine ? { productLine: options.productLine } : {}),
          ...(kind ? { kind } : {}),
          ...(options.customer ? { customer: options.customer } : {}),
          ...(revenue.value === undefined ? {} : { monthlyRevenue: revenue.value }),
          ...(options.urgent ? { urgent: true } : {}),
          ...(options.url ? { url: options.url } : {}),
          ...(options.detail ? { detail: options.detail } : {}),
          ...(options.opportunity ? { opportunity: options.opportunity } : {}),
        });
        report(result, ({ signal }) =>
          messages.success(t('cli:commands.signal.add.success', { id: signal.id }))
        );
      })
    );
}

function createLsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ls')
    .description(t('cli:commands.signal.ls.description'))
    .option('-s, --space <space>', t('cli:commands.signal.spaceOption'))
    .option('--unlinked', t('cli:commands.signal.ls.unlinkedOption'))
    .action((options: { space?: string; unlinked?: boolean }) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ManageSignalsUseCase).list({
          ...(options.space ? { space: options.space } : {}),
          ...(options.unlinked ? { unlinked: true } : {}),
        });
        report(result, ({ signals }) =>
          renderListView({
            title: t('cli:commands.signal.ls.title'),
            columns: [
              { label: t('cli:commands.signal.ls.idColumn'), width: 38 },
              { label: t('cli:commands.signal.ls.titleColumn'), width: 36 },
              { label: t('cli:commands.signal.ls.kindColumn'), width: 10 },
              { label: t('cli:commands.signal.ls.customerColumn'), width: 22 },
              { label: t('cli:commands.signal.ls.opportunityColumn'), width: 38 },
            ],
            rows: signals.map((signal) => [
              colors.muted(signal.id),
              signal.urgent ? colors.error(`! ${signal.title}`) : signal.title,
              signal.kind,
              [signal.customer, signal.monthlyRevenue ? `${signal.monthlyRevenue}/mo` : undefined]
                .filter(Boolean)
                .join(' · ') || colors.muted('-'),
              signal.opportunityId ?? colors.muted(t('cli:commands.signal.ls.unlinked')),
            ]),
            emptyMessage: t('cli:commands.signal.ls.empty'),
          })
        );
      })
    );
}

function createRmCommand(): Command {
  const t = getCliI18n().t;
  return new Command('rm')
    .description(t('cli:commands.signal.rm.description'))
    .argument('<signal>', t('cli:commands.signal.signalArg'))
    .action((id: string) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ManageSignalsUseCase).remove(id);
        report(result, () => messages.success(t('cli:commands.signal.rm.success', { id })));
      })
    );
}

export function createSignalCommand(): Command {
  return new Command('signal')
    .description(getCliI18n().t('cli:commands.signal.description'))
    .addCommand(createAddCommand())
    .addCommand(createLsCommand())
    .addCommand(createRmCommand());
}
