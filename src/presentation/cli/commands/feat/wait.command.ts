/**
 * Feature Wait Command (spec 149)
 *
 * Blocks until a feature's agent needs someone or stops — or reaches the
 * states named with --until — so scripts and other agents can act on it.
 * The exit code says how the wait ended.
 *
 * Usage: shep feat wait <id> [--until blocked,done] [--timeout 600] [--json]
 */

import { Command } from 'commander';
import { container } from '@/infrastructure/di/container.js';
import { ActivityWaitOutcome, AgentActivityState } from '@/domain/generated/output.js';
import { WaitForAgentActivityUseCase } from '@/application/use-cases/agent-activity/wait-for-agent-activity.use-case.js';
import { messages } from '../../ui/index.js';
import { getCliI18n } from '../../i18n.js';
import { parseNumberOption } from '../number-option.js';
import { renderActivity, stateLabel } from './activity-output.js';

/** How `shep feat wait` exits, so a script can branch on it. */
export const WAIT_EXIT_CODE: Record<ActivityWaitOutcome, number> = {
  [ActivityWaitOutcome.Matched]: 0,
  [ActivityWaitOutcome.NotFound]: 1,
  [ActivityWaitOutcome.TimedOut]: 2,
  [ActivityWaitOutcome.Ambiguous]: 3,
  [ActivityWaitOutcome.Aborted]: 130,
};

const MS_PER_SECOND = 1000;
const STATE_SEPARATOR = ',';
const ACTIVITY_STATES: ReadonlySet<string> = new Set(Object.values(AgentActivityState));
const INTERRUPT = 'SIGINT';

interface WaitOptions {
  until?: string;
  timeout?: string;
  json?: boolean;
}

export function createWaitCommand(): Command {
  const t = getCliI18n().t;
  return new Command('wait')
    .description(t('cli:commands.feat.wait.description'))
    .argument('<id>', t('cli:commands.feat.wait.idArgument'))
    .option('--until <states>', t('cli:commands.feat.wait.untilOption'))
    .option('--timeout <seconds>', t('cli:commands.feat.wait.timeoutOption'))
    .option('--json', t('cli:commands.feat.wait.jsonOption'))
    .addHelpText(
      'after',
      `
Examples:
  $ shep feat wait abc12345                    Until it needs someone, finishes or fails
  $ shep feat wait abc --until done --timeout 3600

Exit codes: 0 reached, 1 not found, 2 timed out, 3 ambiguous id, 130 interrupted`
    )
    .action(async (featureId: string, options: WaitOptions) => {
      const until = parseStates(options.until);
      if (until === null) {
        messages.error(
          t('cli:commands.feat.wait.invalidState', {
            state: options.until,
            states: [...ACTIVITY_STATES].join(', '),
          })
        );
        process.exitCode = 1;
        return;
      }
      const timeout = parseNumberOption('--timeout', options.timeout);
      if (!timeout.ok) return;

      const controller = new AbortController();
      const abort = (): void => controller.abort();
      process.once(INTERRUPT, abort);
      try {
        const result = await container.resolve(WaitForAgentActivityUseCase).execute({
          featureId,
          signal: controller.signal,
          ...(until ? { until } : {}),
          ...(timeout.value !== undefined ? { timeoutMs: timeout.value * MS_PER_SECOND } : {}),
        });
        process.exitCode = WAIT_EXIT_CODE[result.outcome];
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        if (result.outcome !== ActivityWaitOutcome.Matched) {
          messages.warning(
            t(`cli:commands.feat.wait.outcomes.${result.outcome}`, {
              id: featureId,
              state: result.activity ? stateLabel(result.activity.state, t) : '',
            })
          );
        }
        if (result.activity) renderActivity(result.activity, t);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        messages.error(t('cli:commands.feat.wait.failed'), err);
        process.exitCode = 1;
      } finally {
        process.off(INTERRUPT, abort);
      }
    });
}

/** The states named, undefined for none, null when one is unknown. */
function parseStates(value: string | undefined): AgentActivityState[] | undefined | null {
  if (value === undefined) return undefined;
  const states = value
    .split(STATE_SEPARATOR)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (states.length === 0 || states.some((s) => !ACTIVITY_STATES.has(s))) return null;
  return states as AgentActivityState[];
}
