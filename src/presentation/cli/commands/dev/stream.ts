/**
 * Shared log/state streaming for the `shep dev` command group.
 *
 * `shep dev start` and `shep dev logs --follow` want the same thing: print
 * what the deployment has already said, then keep printing until it settles or
 * the user walks away. That loop lives here once.
 *
 * It streams through use cases only — `StreamDeploymentLogsUseCase` for the
 * lines and `GetDeploymentStatusUseCase` for the state — never through the
 * web SSE route at `app/api/deployment-logs`. Consuming that route would make
 * the web daemon a hard dependency of the CLI, the inverse of FR-23.
 *
 * State is polled rather than pushed because `IDeploymentService` emits only
 * 'log'; the poll interval is a rendering cadence (a presentation concern),
 * not a decision about the deployment.
 */

import type {
  DeploymentStatus,
  LogEntry,
} from '@/application/ports/output/services/deployment-service.interface.js';
import type { GetDeploymentStatusUseCase } from '@/application/use-cases/deployments/get-deployment-status.use-case.js';
import type { StreamDeploymentLogsUseCase } from '@/application/use-cases/deployments/stream-deployment-logs.use-case.js';
import { DeploymentState } from '@/domain/generated/output.js';
import { container } from '@/infrastructure/di/container.js';

import { getCliI18n } from '../../i18n.js';
import { colors } from '../../ui/index.js';

/** How often the deployment state is re-read while following. */
const POLL_INTERVAL_MS = 400;

/** Show every line by default. */
export const ALL_LINES = 0;

export enum DevStreamOutcome {
  /** The dev server reached Ready. */
  Ready = 'ready',
  /** The run ended without becoming ready — `failureReason` explains why. */
  Failed = 'failed',
  /** Nothing has ever run for this target. */
  Untracked = 'untracked',
  /** The user pressed Ctrl-C; the dev server was left running. */
  Interrupted = 'interrupted',
}

export interface DevStreamResult {
  outcome: DevStreamOutcome;
  url: string | null;
  /**
   * The graph's terminal reason. The dev-server agent logs it and then stops
   * the deployment, so the last line seen before the target disappeared IS
   * the reason — there is no separate channel for it.
   */
  failureReason: string | null;
}

/** Write one captured line, tagging stderr so it is distinguishable. */
function writeLine(entry: LogEntry): void {
  const text = entry.stream === 'stderr' ? colors.warning(entry.line) : entry.line;
  process.stdout.write(`  ${text}\n`);
}

/** Print (at most `tail`) already-captured lines; return the last one seen. */
function printHistory(history: LogEntry[], tail: number): string | null {
  const shown = tail > ALL_LINES ? history.slice(-tail) : history;
  for (const entry of shown) writeLine(entry);
  return history.length > 0 ? history[history.length - 1].line : null;
}

/** Human label for a lifecycle state, or "stopped" for an absent one. */
function stateLabel(state: DeploymentState | null): string {
  const t = getCliI18n().t;
  switch (state) {
    case DeploymentState.Analyzing:
      return colors.info(t('cli:commands.dev.state.analyzing'));
    case DeploymentState.Installing:
      return colors.info(t('cli:commands.dev.state.installing'));
    case DeploymentState.Booting:
      return colors.info(t('cli:commands.dev.state.booting'));
    case DeploymentState.Ready:
      return colors.success(t('cli:commands.dev.state.ready'));
    default:
      return colors.muted(t('cli:commands.dev.state.stopped'));
  }
}

/** Print the accumulated trail for a target. False when nothing ever ran. */
export function printDeploymentLogs(targetId: string, tail: number): boolean {
  const stream = container
    .resolve<StreamDeploymentLogsUseCase>('StreamDeploymentLogsUseCase')
    .execute({ targetId });
  try {
    if (!stream.tracked) return false;
    printHistory(stream.history, tail);
    return true;
  } finally {
    stream.close();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export interface FollowDeploymentOptions {
  targetId: string;
  /** History lines to print before following. */
  tail: number;
  /** Announce each lifecycle transition (`shep dev start` does, `logs` does not). */
  showStates: boolean;
  /**
   * Return as soon as the server is Ready. `start` does — its job is done at
   * that point. `logs --follow` does not: a tail that stopped the moment the
   * server came up would hide everything the server actually says.
   */
  stopWhenReady: boolean;
}

/**
 * Print history, then follow live output until the deployment settles or the
 * user interrupts.
 *
 * Ctrl-C detaches the stream only: dev servers are spawned in their own
 * process group (`detached: true`) so the signal never reaches them. On
 * Windows, where that option is unavailable, the console may deliver Ctrl-C to
 * the child as well — `shep dev stop` is the portable way to stop a server.
 */
export async function followDeployment(options: FollowDeploymentOptions): Promise<DevStreamResult> {
  const { targetId, tail, showStates, stopWhenReady } = options;
  const statusUseCase = container.resolve<GetDeploymentStatusUseCase>('GetDeploymentStatusUseCase');
  const streamUseCase = container.resolve<StreamDeploymentLogsUseCase>(
    'StreamDeploymentLogsUseCase'
  );

  let lastLine: string | null = null;
  const stream = streamUseCase.execute({
    targetId,
    onLine: (entry) => {
      lastLine = entry.line;
      writeLine(entry);
    },
  });
  lastLine = printHistory(stream.history, tail) ?? lastLine;

  if (!stream.tracked) {
    stream.close();
    return { outcome: DevStreamOutcome.Untracked, url: null, failureReason: null };
  }

  let interrupted = false;
  const onInterrupt = (): void => {
    interrupted = true;
  };
  process.on('SIGINT', onInterrupt);

  try {
    let lastState: DeploymentState | null | undefined;
    for (;;) {
      if (interrupted) {
        return { outcome: DevStreamOutcome.Interrupted, url: null, failureReason: null };
      }

      const status: DeploymentStatus | null = await statusUseCase.execute(targetId);
      const state = status?.state ?? null;
      if (showStates && state !== lastState) {
        process.stdout.write(`  [${stateLabel(state)}]\n`);
      }
      lastState = state;

      if (state === DeploymentState.Ready && stopWhenReady) {
        return { outcome: DevStreamOutcome.Ready, url: status?.url ?? null, failureReason: null };
      }
      if (state === null || state === DeploymentState.Stopped) {
        // The agent logs its terminal reason and THEN stops the deployment, so
        // the last line seen is the reason. A server the user stopped from
        // elsewhere lands here too — which is why `logs` treats this as "ended"
        // while `start` treats it as "never became ready".
        return { outcome: DevStreamOutcome.Failed, url: null, failureReason: lastLine };
      }

      await delay(POLL_INTERVAL_MS);
    }
  } finally {
    stream.close();
    process.off('SIGINT', onInterrupt);
  }
}

/**
 * Flush queued stdout writes before exiting.
 *
 * `dev start` and `dev logs --follow` must call `process.exit()`: the
 * deployment service holds piped handles on the spawned dev server, so the
 * event loop would otherwise stay alive for as long as the server runs. Writes
 * to a pipe are asynchronous, so exiting without flushing can truncate output.
 */
export async function flushOutput(): Promise<void> {
  await new Promise<void>((resolve) => {
    process.stdout.write('', () => resolve());
  });
}
