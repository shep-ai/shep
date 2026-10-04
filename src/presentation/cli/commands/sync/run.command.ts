/** shep sync run [rule] — run one sync rule, or every enabled one, now (spec 122). */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import {
  RunTrackerSyncUseCase,
  type TrackerSyncOutcome,
} from '@/application/use-cases/trackers/run-tracker-sync.use-case.js';
import { SyncTrackerRulesUseCase } from '@/application/use-cases/trackers/sync-tracker-rules.use-case.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { runCommand, type UseCaseResult } from '../command-result.js';
import { formatRunSummary } from './format-summary.js';

function print(result: UseCaseResult<TrackerSyncOutcome>): boolean {
  const t = getCliI18n().t;
  if (!result.ok) {
    messages.error(result.error);
    return false;
  }
  const line = `${result.rule.scope}: ${formatRunSummary(result.summary)}`;
  if (result.error) {
    messages.error(`${line} — ${result.error}`);
    return false;
  }
  messages.success(line);
  if (result.summary.conflicts > 0) {
    messages.info(t('cli:commands.sync.run.conflictsNote', { count: result.summary.conflicts }));
  }
  return true;
}

export function createRunCommand(): Command {
  const t = getCliI18n().t;
  return new Command('run')
    .description(t('cli:commands.sync.run.description'))
    .argument('[rule]', t('cli:commands.sync.ruleArg'))
    .action((rule: string | undefined) =>
      runCommand('cli:commands.sync.failed', async () => {
        const results = rule
          ? [await container.resolve(RunTrackerSyncUseCase).execute(rule)]
          : await container.resolve(SyncTrackerRulesUseCase).runAll();
        if (results.length === 0) {
          messages.info(t('cli:commands.sync.run.nothing'));
          return;
        }
        const allGood = results.map(print).every(Boolean);
        if (!allGood) process.exitCode = 1;
      })
    );
}
