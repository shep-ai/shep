/**
 * Shep ASPM Campaigns Command
 *
 * Manages RemediationCampaigns — list, create, close.
 *
 * Usage:
 *   shep aspm campaigns list [--status Active] [--owner <id>] [--json]
 *   shep aspm campaigns create --name <s> --description <s> [--severity Critical,High]
 *                              [--owner <id>] [--due <iso>] [--actor <s>]
 *   shep aspm campaigns close <id> --actor <s> [--status Completed|Cancelled] [--note <s>]
 *   shep aspm campaigns progress <id> [--json]
 *
 * Feature 098, phase 10, task-56.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { CreateCampaignUseCase } from '@/application/use-cases/aspm/campaigns/create-campaign.js';
import { CloseCampaignUseCase } from '@/application/use-cases/aspm/campaigns/close-campaign.js';
import { ListCampaignsUseCase } from '@/application/use-cases/aspm/campaigns/list-campaigns.js';
import { GetCampaignProgressUseCase } from '@/application/use-cases/aspm/campaigns/get-campaign-progress.js';
import {
  CampaignStatus,
  CanonicalSeverity,
  type FindingFilter,
  type RemediationCampaign,
} from '@/domain/generated/output.js';
import { colors, messages, renderListView } from '../../ui/index.js';

interface CampaignsListOpts {
  status?: string;
  owner?: string;
  json?: boolean;
}

interface CampaignsCreateOpts {
  name: string;
  description: string;
  severity?: string;
  owner?: string;
  due?: string;
  actor?: string;
  json?: boolean;
}

interface CampaignsCloseOpts {
  status?: string;
  note?: string;
  actor?: string;
}

interface CampaignsProgressOpts {
  json?: boolean;
}

export function createAspmCampaignsCommand(): Command {
  const cmd = new Command('campaigns').description('Manage ASPM remediation campaigns');

  cmd
    .command('list')
    .description('List remediation campaigns')
    .option('--status <list>', 'Comma-separated statuses (Draft,Active,Paused,Completed,Cancelled)')
    .option('--owner <id>', 'Filter by owner id')
    .option('--json', 'Emit JSON instead of a table')
    .action(async (opts: CampaignsListOpts) => {
      try {
        const useCase = container.resolve(ListCampaignsUseCase);
        const statuses = opts.status ? parseEnumList(opts.status, CampaignStatus) : undefined;
        const campaigns = await useCase.execute({ statuses, ownerId: opts.owner });

        if (opts.json) {
          console.log(JSON.stringify(campaigns, null, 2));
          return;
        }

        renderCampaignsTable(campaigns);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to list campaigns', err);
        process.exitCode = 1;
      }
    });

  cmd
    .command('create')
    .description('Create a remediation campaign')
    .requiredOption('--name <name>', 'Campaign name')
    .requiredOption('--description <desc>', 'Campaign description')
    .option('--severity <list>', 'Comma-separated canonical severities for the target query')
    .option('--owner <id>', 'Owner id')
    .option('--due <iso>', 'Due date (ISO-8601)')
    .option('--actor <name>', 'Who is creating the campaign (audit trail)', 'cli')
    .option('--json', 'Emit JSON instead of a formatted view')
    .action(async (opts: CampaignsCreateOpts) => {
      try {
        const targetQuery: FindingFilter = {};
        if (opts.severity) {
          targetQuery.severities = parseEnumList(opts.severity, CanonicalSeverity);
        }
        const useCase = container.resolve(CreateCampaignUseCase);
        const campaign = await useCase.execute({
          name: opts.name,
          description: opts.description,
          targetQuery,
          createdBy: opts.actor ?? 'cli',
          ownerId: opts.owner,
          dueDate: opts.due ? new Date(opts.due) : undefined,
        });

        if (opts.json) {
          console.log(JSON.stringify(campaign, null, 2));
          return;
        }

        messages.success(`Campaign created: ${campaign.id}`);
        renderCampaignDetail(campaign);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to create campaign', err);
        process.exitCode = 1;
      }
    });

  cmd
    .command('close')
    .description('Close (Complete/Cancel) a remediation campaign')
    .argument('<id>', 'Campaign id')
    .option('--status <status>', 'Target status (Completed or Cancelled)', 'Completed')
    .option('--actor <name>', 'Who is closing the campaign', 'cli')
    .option('--note <note>', 'Optional audit note')
    .action(async (id: string, opts: CampaignsCloseOpts) => {
      try {
        const target = (opts.status ?? 'Completed') as CampaignStatus;
        if (
          target !== CampaignStatus.Completed &&
          target !== CampaignStatus.Cancelled &&
          target !== CampaignStatus.Active &&
          target !== CampaignStatus.Paused
        ) {
          messages.error(
            `Invalid status: ${target}. Expected Completed | Cancelled | Active | Paused`
          );
          process.exitCode = 2;
          return;
        }
        const useCase = container.resolve(CloseCampaignUseCase);
        await useCase.execute({
          campaignId: id,
          targetStatus: target,
          actor: opts.actor ?? 'cli',
          note: opts.note,
        });
        messages.success(`Campaign ${id} -> ${target}`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to close campaign', err);
        process.exitCode = 1;
      }
    });

  cmd
    .command('progress')
    .description('Show campaign progress (total/closed/at-risk/blocked)')
    .argument('<id>', 'Campaign id')
    .option('--json', 'Emit JSON instead of a formatted view')
    .action(async (id: string, opts: CampaignsProgressOpts) => {
      try {
        const useCase = container.resolve(GetCampaignProgressUseCase);
        const result = await useCase.execute({ campaignId: id });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        const p = result.progress;
        console.log('');
        console.log(`  ${colors.brand('Campaign progress')} ${colors.muted(id)}`);
        console.log('');
        console.log(`  Total      ${p.total}`);
        console.log(`  Closed     ${colors.success(String(p.closed))}`);
        console.log(`  At risk    ${colors.warning(String(p.atRisk))}`);
        console.log(`  Blocked    ${colors.error(String(p.blocked))}`);
        if (result.truncated) {
          console.log(colors.muted('  (count truncated at 5,000 — narrow the target query)'));
        }
        console.log('');
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to get campaign progress', err);
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

function renderCampaignsTable(campaigns: RemediationCampaign[]): void {
  const rows = campaigns.map((c) => [
    colors.muted(c.id.substring(0, 8)),
    c.name,
    colorStatus(c.status),
    c.ownerId ?? colors.muted('—'),
    c.dueDate ? new Date(c.dueDate).toLocaleDateString() : colors.muted('—'),
  ]);

  renderListView({
    title: `Campaigns (${campaigns.length})`,
    columns: [
      { label: 'ID', width: 10 },
      { label: 'Name', width: 32 },
      { label: 'Status', width: 12 },
      { label: 'Owner', width: 36 },
      { label: 'Due', width: 12 },
    ],
    rows,
    emptyMessage: 'No campaigns yet.',
  });
}

function renderCampaignDetail(c: RemediationCampaign): void {
  const lines = [
    '',
    `  ${colors.brand('Campaign')} ${colors.muted(c.id)}`,
    '',
    `  Name        ${c.name}`,
    `  Status      ${colorStatus(c.status)}`,
    `  Owner       ${c.ownerId ?? colors.muted('—')}`,
    `  Due         ${c.dueDate ? new Date(c.dueDate).toLocaleDateString() : colors.muted('—')}`,
    `  Created     ${new Date(c.createdAt).toLocaleString()}`,
    '',
  ];
  console.log(lines.join('\n'));
}

function colorStatus(s: string): string {
  switch (s) {
    case 'Active':
      return colors.success(s);
    case 'Draft':
      return colors.muted(s);
    case 'Paused':
      return colors.warning(s);
    case 'Completed':
      return colors.success(s);
    case 'Cancelled':
      return colors.muted(s);
    default:
      return s;
  }
}
