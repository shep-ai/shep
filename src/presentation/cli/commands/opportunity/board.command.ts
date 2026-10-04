/** shep opportunity ls | show | weights (spec 126). */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { GetOpportunityBoardUseCase } from '@/application/use-cases/opportunities/get-opportunity-board.use-case.js';
import { ManageOpportunitiesUseCase } from '@/application/use-cases/opportunities/manage-opportunities.use-case.js';
import {
  ManageOpportunityWeightsUseCase,
  type WeightsChange,
} from '@/application/use-cases/opportunities/manage-opportunity-weights.use-case.js';
import { colors, messages, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { report, runCommand } from '../command-result.js';
import { parseNumberOption } from '../number-option.js';
import { FAILED } from './decide.command.js';
import { formatEvidence, formatScore } from './format-score.js';

export function createLsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('ls')
    .description(t('cli:commands.opportunity.ls.description'))
    .option('-s, --space <space>', t('cli:commands.opportunity.spaceOption'))
    .action((options: { space?: string }) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(GetOpportunityBoardUseCase).execute(options.space);
        report(result, ({ board }) => {
          const inLine = new Set(board.line.inLine.map((s) => s.opportunity.id));
          renderListView({
            title: t('cli:commands.opportunity.ls.title', {
              space: board.space.name,
              used: board.line.usedHours,
              capacity: board.line.capacityHours,
            }),
            columns: [
              { label: '', width: 2 },
              { label: t('cli:commands.opportunity.ls.idColumn'), width: 38 },
              { label: t('cli:commands.opportunity.ls.titleColumn'), width: 32 },
              { label: t('cli:commands.opportunity.ls.statusColumn'), width: 10 },
              { label: t('cli:commands.opportunity.ls.scoreColumn'), width: 8 },
              { label: t('cli:commands.opportunity.ls.hoursColumn'), width: 6 },
              { label: t('cli:commands.opportunity.ls.evidenceColumn'), width: 44 },
            ],
            rows: board.ranked.map((scored) => [
              inLine.has(scored.opportunity.id) ? colors.success('▶') : ' ',
              colors.muted(scored.opportunity.id),
              scored.opportunity.title,
              scored.opportunity.status,
              formatScore(scored),
              String(scored.opportunity.reviewHours),
              formatEvidence(scored),
            ]),
            emptyMessage: t('cli:commands.opportunity.ls.empty'),
          });
          if (board.unlinkedSignals.length > 0) {
            messages.info(
              t('cli:commands.opportunity.ls.unlinked', { count: board.unlinkedSignals.length })
            );
          }
        });
      })
    );
}

export function createShowCommand(): Command {
  const t = getCliI18n().t;
  return new Command('show')
    .description(t('cli:commands.opportunity.show.description'))
    .argument('<opportunity>', t('cli:commands.opportunity.opportunityArg'))
    .action((id: string) =>
      runCommand(FAILED, async () => {
        const result = await container.resolve(ManageOpportunitiesUseCase).show(id);
        report(result, ({ detail }) => {
          const { opportunity } = detail;
          messages.info(`${colors.accent(opportunity.title)} ${colors.muted(opportunity.status)}`);
          if (opportunity.problem) messages.info(opportunity.problem);
          messages.info(
            t('cli:commands.opportunity.show.score', {
              score: formatScore(detail),
              value: detail.value,
              hours: opportunity.reviewHours,
              confidence: opportunity.confidence,
            })
          );
          messages.info(formatEvidence(detail));
          if (opportunity.dropReason) {
            messages.info(
              t('cli:commands.opportunity.show.dropped', { reason: opportunity.dropReason })
            );
          }
          for (const signal of detail.signals) {
            messages.info(`  - ${signal.title}${signal.customer ? ` (${signal.customer})` : ''}`);
          }
        });
      })
    );
}

interface WeightsOptions {
  space?: string;
  reach?: string;
  revenue?: string;
  urgency?: string;
  strategic?: string;
  capacity?: string;
}

const WEIGHT_OPTIONS: [keyof WeightsOptions, keyof WeightsChange][] = [
  ['reach', 'reach'],
  ['revenue', 'revenue'],
  ['urgency', 'urgency'],
  ['strategic', 'strategic'],
  ['capacity', 'weeklyReviewHours'],
];

export function createWeightsCommand(): Command {
  const t = getCliI18n().t;
  return new Command('weights')
    .description(t('cli:commands.opportunity.weights.description'))
    .option('-s, --space <space>', t('cli:commands.opportunity.spaceOption'))
    .option('--reach <n>', t('cli:commands.opportunity.weights.reachOption'))
    .option('--revenue <n>', t('cli:commands.opportunity.weights.revenueOption'))
    .option('--urgency <n>', t('cli:commands.opportunity.weights.urgencyOption'))
    .option('--strategic <n>', t('cli:commands.opportunity.weights.strategicOption'))
    .option('--capacity <hours>', t('cli:commands.opportunity.weights.capacityOption'))
    .action((options: WeightsOptions) =>
      runCommand(FAILED, async () => {
        const change: WeightsChange = {};
        for (const [option, field] of WEIGHT_OPTIONS) {
          const parsed = parseNumberOption(`--${option}`, options[option]);
          if (!parsed.ok) return;
          if (parsed.value !== undefined) change[field] = parsed.value;
        }
        const useCase = container.resolve(ManageOpportunityWeightsUseCase);
        const result =
          Object.keys(change).length === 0
            ? await useCase.get(options.space)
            : await useCase.set(options.space, change);
        report(result, ({ weights }) =>
          messages.info(
            t('cli:commands.opportunity.weights.current', {
              reach: weights.reach,
              revenue: weights.revenue,
              urgency: weights.urgency,
              strategic: weights.strategic,
              capacity: weights.weeklyReviewHours,
            })
          )
        );
      })
    );
}
