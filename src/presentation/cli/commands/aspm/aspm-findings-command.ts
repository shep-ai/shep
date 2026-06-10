/**
 * Shep ASPM Findings Command
 *
 * Lists SecurityFindings filtered by application / severity / owner /
 * state / KEV flag and shows individual findings.
 *
 * Usage:
 *   shep aspm findings list [--app <slug>] [--severity Critical,High]
 *                            [--owner <id>] [--state Open]
 *                            [--kev] [--limit 25] [--json]
 *   shep aspm findings show <id> [--json]
 *
 * Feature 098, phase 10, task-56.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ListFindingsUseCase } from '@/application/use-cases/aspm/findings/list-findings.js';
import { GetFindingUseCase } from '@/application/use-cases/aspm/findings/get-finding.js';
import {
  CanonicalSeverity,
  FindingState,
  type FindingFilter,
  type SecurityFinding,
} from '@/domain/generated/output.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { resolveApplication } from './resolve-application.js';

interface FindingsListOptions {
  app?: string;
  severity?: string;
  owner?: string;
  state?: string;
  kev?: boolean;
  limit?: string;
  offset?: string;
  json?: boolean;
}

interface FindingsShowOptions {
  json?: boolean;
}

export function createAspmFindingsCommand(): Command {
  const cmd = new Command('findings')
    .description('List and inspect ASPM security findings')
    .addHelpText(
      'after',
      `
Examples:
  $ shep aspm findings list --app api --severity Critical,High --limit 25  Review critical and high findings
  $ shep aspm findings list --state Open --kev --json                       Export open KEV findings
  $ shep aspm findings show finding_123 --json                              Inspect one finding`
    );

  cmd
    .command('list')
    .description('List findings (paginated, filterable)')
    .option('--app <slug>', 'Filter by application slug or id')
    .option(
      '--severity <list>',
      'Comma-separated canonical severities (Critical,High,Medium,Low,Info)'
    )
    .option('--owner <id>', 'Filter by owner id')
    .option('--state <list>', 'Comma-separated states (Open,Triaged,InProgress,Resolved,Closed)')
    .option('--kev', 'Show only KEV-listed findings')
    .option('--limit <n>', 'Page size (default 25)')
    .option('--offset <n>', 'Page offset (default 0)')
    .option('--json', 'Emit JSON instead of a table')
    .action(async (opts: FindingsListOptions) => {
      try {
        const filter: FindingFilter = {};
        if (opts.app) {
          const resolved = await resolveApplication(opts.app);
          if ('error' in resolved) {
            messages.error(resolved.error);
            process.exitCode = 1;
            return;
          }
          filter.applicationIds = [resolved.application.id];
        }
        if (opts.severity) {
          filter.severities = parseEnumList(opts.severity, CanonicalSeverity);
        }
        if (opts.state) {
          filter.states = parseEnumList(opts.state, FindingState);
        }
        if (opts.owner) filter.ownerIds = [opts.owner];
        if (opts.kev) filter.kev = true;

        const useCase = container.resolve(ListFindingsUseCase);
        const result = await useCase.execute({
          filter,
          cursor: {
            limit: opts.limit ? Number(opts.limit) : undefined,
            offset: opts.offset ? Number(opts.offset) : undefined,
          },
        });

        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                total: result.total,
                offset: result.offset,
                limit: result.limit,
                items: result.items,
              },
              null,
              2
            )
          );
          return;
        }

        renderFindingsTable(result.items, result.total, result.offset, result.limit);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to list findings', err);
        process.exitCode = 1;
      }
    });

  cmd
    .command('show')
    .description('Show a single finding by id')
    .argument('<id>', 'Finding id')
    .option('--json', 'Emit JSON instead of a formatted view')
    .action(async (id: string, opts: FindingsShowOptions) => {
      try {
        const useCase = container.resolve(GetFindingUseCase);
        const finding = await useCase.execute({ id });
        if (opts.json) {
          console.log(JSON.stringify(finding, null, 2));
          return;
        }
        renderFindingDetail(finding);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to show finding', err);
        process.exitCode = 1;
      }
    });

  return cmd;
}

function parseEnumList<T extends Record<string, string>>(
  raw: string,
  enumObj: T
): T[keyof T][] | undefined {
  const valid = new Set(Object.values(enumObj));
  const tokens = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const matches = tokens.filter((t) => valid.has(t)) as T[keyof T][];
  return matches.length > 0 ? matches : undefined;
}

function renderFindingsTable(
  items: SecurityFinding[],
  total: number,
  offset: number,
  limit: number
): void {
  const rows = items.map((f) => [
    colors.muted(f.id.substring(0, 8)),
    colorSeverity(f.canonicalSeverity),
    f.findingDomain,
    truncate(f.title ?? f.ruleId, 40),
    f.kev ? colors.warning('KEV') : colors.muted('—'),
    f.state,
  ]);

  renderListView({
    title: `Findings (${offset + 1}-${Math.min(offset + items.length, total)} of ${total})`,
    columns: [
      { label: 'ID', width: 10 },
      { label: 'Severity', width: 10 },
      { label: 'Domain', width: 12 },
      { label: 'Title', width: 42 },
      { label: 'KEV', width: 6 },
      { label: 'State', width: 12 },
    ],
    rows,
    emptyMessage: 'No findings match the filter.',
  });
  if (offset + items.length < total) {
    console.log(colors.muted(`  next: --offset ${offset + limit}`));
  }
}

function renderFindingDetail(f: SecurityFinding): void {
  const lines = [
    '',
    `  ${colors.brand('Finding')} ${colors.muted(f.id)}`,
    '',
    `  Title       ${f.title ?? colors.muted('—')}`,
    `  Severity    ${colorSeverity(f.canonicalSeverity)} ${colors.muted(`(raw: ${f.rawSeverity ?? '—'})`)}`,
    `  Domain      ${f.findingDomain}`,
    `  Rule        ${f.ruleId}`,
    `  State       ${f.state}`,
    `  KEV         ${f.kev ? colors.warning('yes') : colors.muted('no')}`,
    `  EPSS        ${f.epssPercentile !== undefined ? f.epssPercentile.toFixed(3) : colors.muted('—')}`,
    `  Owner       ${f.ownerId ?? colors.muted('(unassigned)')}`,
    `  Location    ${f.locationPath ?? colors.muted('—')}${f.locationLine ? `:${f.locationLine}` : ''}`,
    `  CVE/CWE     ${f.cveId ?? colors.muted('—')} / ${f.cweId ?? colors.muted('—')}`,
    `  Discovered  ${new Date(f.discoveredAt).toLocaleString()}`,
    '',
  ];
  console.log(lines.join('\n'));
}

function colorSeverity(s: string | undefined): string {
  switch (s) {
    case 'Critical':
      return colors.error('Critical');
    case 'High':
      return colors.warning('High');
    case 'Medium':
      return colors.brand('Medium');
    case 'Low':
      return colors.muted('Low');
    case 'Info':
      return colors.muted('Info');
    default:
      return colors.muted('—');
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
