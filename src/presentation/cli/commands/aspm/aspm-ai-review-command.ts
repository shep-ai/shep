/**
 * Shep ASPM AI Review Command
 *
 * Triages the `AiChangeRiskSignal` queue: list current signals, dismiss
 * false-positives, or graduate confirmed risks into SecurityFindings.
 *
 * Usage:
 *   shep aspm ai-review list [--app <slug>] [--state Open] [--limit 50] [--json]
 *   shep aspm ai-review dismiss <signalId> --actor <name> --justification <text>
 *   shep aspm ai-review graduate <signalId> [--title <s>] [--description <s>] [--owner <id>] [--json]
 *
 * Feature 098, phase 10, task-56.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ListAiSignalsUseCase } from '@/application/use-cases/aspm/ai-review/list-ai-signals.js';
import { DismissAiSignalUseCase } from '@/application/use-cases/aspm/ai-review/dismiss-ai-signal.js';
import { GraduateAiSignalToFindingUseCase } from '@/application/use-cases/aspm/ai-review/graduate-ai-signal-to-finding.js';
import { AiSignalState, type AiChangeRiskSignal } from '@/domain/generated/output.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { resolveApplication } from './resolve-application.js';

interface AiReviewListOpts {
  app?: string;
  state?: string;
  limit?: string;
  offset?: string;
  json?: boolean;
}

interface AiReviewDismissOpts {
  actor: string;
  justification: string;
}

interface AiReviewGraduateOpts {
  title?: string;
  description?: string;
  owner?: string;
  json?: boolean;
}

export function createAspmAiReviewCommand(): Command {
  const cmd = new Command('ai-review').description('Triage AI-change risk signals').addHelpText(
    'after',
    `
Examples:
  $ shep aspm ai-review list --app api --state Open --limit 50              Review open AI-change signals
  $ shep aspm ai-review dismiss signal_123 --actor alice --justification "false positive"  Dismiss a signal
  $ shep aspm ai-review graduate signal_123 --owner team-security --json    Create a finding from a signal`
  );

  cmd
    .command('list')
    .description('List AiChangeRiskSignal queue entries')
    .option('--app <slug>', 'Filter by application slug or id')
    .option('--state <list>', 'Comma-separated states (Open,Acknowledged,Dismissed,Resolved)')
    .option('--limit <n>', 'Page size (default 50)')
    .option('--offset <n>', 'Page offset (default 0)')
    .option('--json', 'Emit JSON instead of a table')
    .action(async (opts: AiReviewListOpts) => {
      try {
        let applicationId: string | undefined;
        if (opts.app !== undefined) {
          const resolved = await resolveApplication(opts.app);
          if ('error' in resolved) {
            messages.error(resolved.error);
            process.exitCode = 1;
            return;
          }
          applicationId = resolved.application.id;
        }

        const states = parseStates(opts.state);
        const useCase = container.resolve(ListAiSignalsUseCase);
        const items = await useCase.execute({
          applicationId,
          states,
          limit: opts.limit ? Number(opts.limit) : undefined,
          offset: opts.offset ? Number(opts.offset) : undefined,
        });

        if (opts.json) {
          console.log(JSON.stringify(items, null, 2));
          return;
        }

        renderSignalsTable(items);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to list AI-review signals', err);
        process.exitCode = 1;
      }
    });

  cmd
    .command('dismiss')
    .description('Dismiss an AiChangeRiskSignal as a false positive')
    .argument('<signalId>', 'AiChangeRiskSignal id')
    .requiredOption('--actor <name>', 'Who is dismissing (audit trail)')
    .requiredOption('--justification <text>', 'Justification for dismissal')
    .action(async (signalId: string, opts: AiReviewDismissOpts) => {
      try {
        const useCase = container.resolve(DismissAiSignalUseCase);
        const result = await useCase.execute({
          signalId,
          actor: opts.actor,
          justification: opts.justification,
        });
        messages.success(`Signal ${signalId.substring(0, 8)} dismissed`);
        console.log(colors.muted(`  state=${result.state}`));
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to dismiss signal', err);
        process.exitCode = 1;
      }
    });

  cmd
    .command('graduate')
    .description('Graduate an AiChangeRiskSignal into a SecurityFinding')
    .argument('<signalId>', 'AiChangeRiskSignal id')
    .option('--title <s>', 'Override the finding title')
    .option('--description <s>', 'Override the finding description')
    .option('--owner <id>', 'Override the inherited ownerId')
    .option('--json', 'Emit JSON instead of a formatted view')
    .action(async (signalId: string, opts: AiReviewGraduateOpts) => {
      try {
        const useCase = container.resolve(GraduateAiSignalToFindingUseCase);
        const result = await useCase.execute({
          signalId,
          title: opts.title,
          description: opts.description,
          ownerId: opts.owner,
        });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        messages.success(`Signal ${signalId.substring(0, 8)} graduated`);
        console.log(`  Finding id  ${result.finding.id}`);
        console.log(`  Severity    ${result.finding.canonicalSeverity ?? colors.muted('—')}`);
        console.log(`  State       ${result.finding.state}`);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error('Failed to graduate signal', err);
        process.exitCode = 1;
      }
    });

  return cmd;
}

function parseStates(raw: string | undefined): AiSignalState[] | undefined {
  if (raw === undefined) return undefined;
  const valid = new Set(Object.values(AiSignalState));
  const tokens = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const matches = tokens.filter((t) => valid.has(t as AiSignalState)) as AiSignalState[];
  return matches.length > 0 ? matches : undefined;
}

function renderSignalsTable(items: AiChangeRiskSignal[]): void {
  const rows = items.map((s) => [
    colors.muted(s.id.substring(0, 8)),
    s.signalType,
    colorSeverity(s.severity ?? '—'),
    s.state,
    truncate(s.summary, 48),
  ]);

  renderListView({
    title: `AI-review queue (${items.length})`,
    columns: [
      { label: 'ID', width: 10 },
      { label: 'Type', width: 22 },
      { label: 'Severity', width: 10 },
      { label: 'State', width: 12 },
      { label: 'Summary', width: 50 },
    ],
    rows,
    emptyMessage: 'No AI-change risk signals in this view.',
  });
}

function colorSeverity(s: string): string {
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
