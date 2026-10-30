/**
 * shep learn status | history | show | diff (spec 150) — read the learned
 * harness of a repository through its use cases.
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { HarnessVersionTrend, LearnedHarnessStatus } from '@/domain/generated/output.js';
import { GetCurrentHarnessUseCase } from '@/application/use-cases/harness-learning/get-current-harness.use-case.js';
import {
  ListHarnessHistoryUseCase,
  type HarnessVersionEntry,
} from '@/application/use-cases/harness-learning/list-harness-history.use-case.js';
import { colors, messages, renderDetailView, renderListView } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { runCommand } from '../command-result.js';
import { parseNumberOption } from '../number-option.js';
import {
  FAILED,
  LEARN,
  examples,
  fail,
  isoDay,
  labels,
  percent,
  printJson,
  repositoryPathOf,
  shortId,
  withRepoOption,
  type JsonOption,
  type RepoOption,
} from './learn-output.js';
import { versionFields } from './version-view.js';

const isCandidate = (entry: HarnessVersionEntry): boolean =>
  entry.version.status === LearnedHarnessStatus.Candidate;

export function createStatusCommand(): Command {
  const t = getCliI18n().t;
  return withRepoOption(new Command('status').description(t(`${LEARN}.status.description`)))
    .option('--json', t(`${LEARN}.jsonOption`))
    .addHelpText(
      'after',
      examples('shep learn status', 'shep learn status --repo ~/code/app --json')
    )
    .action((options: RepoOption & JsonOption) =>
      runCommand(FAILED, async () => {
        const repositoryPath = repositoryPathOf(options);
        const [current, history] = await Promise.all([
          container.resolve(GetCurrentHarnessUseCase).execute({ repositoryPath }),
          container.resolve(ListHarnessHistoryUseCase).execute({ repositoryPath }),
        ]);
        const candidates = history.versions.filter(isCandidate).length;
        if (options.json) {
          printJson({ repositoryPath: history.repositoryPath, current, candidates });
          return;
        }
        if (current) {
          renderDetailView({
            title: t(`${LEARN}.status.title`),
            sections: [{ fields: versionFields(current) }],
          });
        } else {
          messages.info(t(`${LEARN}.status.none`));
        }
        messages.info(
          candidates > 0
            ? t(`${LEARN}.status.candidates`, { count: candidates })
            : t(`${LEARN}.status.noCandidates`)
        );
      })
    );
}

/** One history row; the trend cell is the regression flag. */
function historyRow(entry: HarnessVersionEntry, currentVersionId?: string): string[] {
  const { version, metrics } = entry;
  const t = getCliI18n().t;
  const id = shortId(version.id);
  return [
    version.id === currentVersionId
      ? `${colors.accent(id)} ${colors.success(t(`${LEARN}.history.current`))}`
      : colors.accent(id),
    labels.status(version.status),
    labels.origin(version.origin),
    isoDay(version.createdAt),
    String(metrics.count),
    percent(metrics.mergeRate),
    metrics.meanCiFixAttempts.toFixed(1),
    labels.trend(entry.trend),
  ];
}

const HISTORY_COLUMNS = [
  ['id', 18],
  ['status', 12],
  ['origin', 10],
  ['created', 11],
  ['runs', 6],
  ['merged', 7],
  ['ciFixes', 9],
  ['trend', 14],
] as const;

export function createHistoryCommand(): Command {
  const t = getCliI18n().t;
  return withRepoOption(new Command('history').description(t(`${LEARN}.history.description`)))
    .option('-n, --limit <n>', t(`${LEARN}.history.limitOption`))
    .option('--json', t(`${LEARN}.jsonOption`))
    .addHelpText('after', examples('shep learn history', 'shep learn history --limit 10 --json'))
    .action((options: RepoOption & JsonOption & { limit?: string }) =>
      runCommand(FAILED, async () => {
        const limit = parseNumberOption('--limit', options.limit);
        if (!limit.ok) return;
        if (limit.value !== undefined && !(Number.isInteger(limit.value) && limit.value > 0)) {
          fail(t(`${LEARN}.history.invalidLimit`, { value: options.limit }));
          return;
        }
        const history = await container.resolve(ListHarnessHistoryUseCase).execute({
          repositoryPath: repositoryPathOf(options),
          ...(limit.value !== undefined && { limit: limit.value }),
        });
        if (options.json) {
          printJson(history);
          return;
        }
        renderListView({
          title: t(`${LEARN}.history.title`),
          columns: HISTORY_COLUMNS.map(([key, width]) => ({
            label: t(`${LEARN}.history.columns.${key}`),
            width,
          })),
          rows: history.versions.map((entry) => historyRow(entry, history.currentVersionId)),
          emptyMessage: t(`${LEARN}.history.empty`),
        });
        const regressed = history.versions.filter(
          (entry) => entry.trend === HarnessVersionTrend.Regressed
        ).length;
        if (regressed > 0) messages.warning(t(`${LEARN}.history.regressed`, { count: regressed }));
      })
    );
}
