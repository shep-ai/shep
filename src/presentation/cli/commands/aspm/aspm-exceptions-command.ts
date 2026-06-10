/**
 * Shep ASPM Exceptions Command
 *
 * Surfaces RiskException management. The MVP scope (task-56) covers the
 * `list-expiring` read flow that powers the dashboard tile; declare /
 * revoke flows are exposed through the use cases and the web surface,
 * with CLI parity added incrementally as workflows ask for it.
 *
 * Usage:
 *   shep aspm exceptions list-expiring [--within <days>] [--json]
 *
 * Feature 098, phase 10, task-56.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ListExpiringExceptionsUseCase } from '@/application/use-cases/aspm/exceptions/list-expiring-exceptions.js';
import type { RiskException } from '@/domain/generated/output.js';
import { colors, messages, renderListView } from '../../ui/index.js';

interface ListExpiringOpts {
  within?: string;
  json?: boolean;
}

export function createAspmExceptionsCommand(): Command {
  const cmd = new Command('exceptions').description('Manage ASPM risk exceptions').addHelpText(
    'after',
    `
Examples:
  $ shep aspm exceptions list-expiring --within 30        Review exceptions expiring this month
  $ shep aspm exceptions list-expiring --within 7 --json  Export exceptions expiring this week`
  );

  cmd
    .command('list-expiring')
    .description('List active RiskExceptions expiring within the next N days')
    .option('--within <days>', 'Look-ahead window in days (default 14)')
    .option('--json', 'Emit JSON instead of a table')
    .action(async (opts: ListExpiringOpts) => {
      try {
        const within = opts.within !== undefined ? Number(opts.within) : undefined;
        if (within !== undefined && (!Number.isFinite(within) || within < 0)) {
          messages.error('Invalid --within: must be a non-negative number of days');
          process.exitCode = 2;
          return;
        }

        const useCase = container.resolve(ListExpiringExceptionsUseCase);
        const items = await useCase.execute({ withinDays: within });

        if (opts.json) {
          console.log(JSON.stringify(items, null, 2));
          return;
        }

        renderTable(items);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to list expiring exceptions', err);
        process.exitCode = 1;
      }
    });

  return cmd;
}

function renderTable(items: RiskException[]): void {
  const rows = items.map((e) => [
    colors.muted(e.id.substring(0, 8)),
    colors.muted(e.findingId.substring(0, 8)),
    e.reason,
    e.declaredBy,
    formatDate(e.expiresAt as Date | string),
  ]);

  renderListView({
    title: `Expiring exceptions (${items.length})`,
    columns: [
      { label: 'ID', width: 10 },
      { label: 'Finding', width: 10 },
      { label: 'Reason', width: 18 },
      { label: 'Declared by', width: 24 },
      { label: 'Expires', width: 24 },
    ],
    rows,
    emptyMessage: 'No exceptions expiring in this window.',
  });
}

function formatDate(value: Date | string | undefined): string {
  if (value === undefined) return colors.muted('—');
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return colors.muted('—');
  return d.toLocaleString();
}
