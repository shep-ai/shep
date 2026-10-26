/**
 * Herdr activity reporter (spec 148).
 *
 * Herdr (herdr.dev) is a terminal workspace for coding agents: it marks every
 * pane working, blocked or idle and notifies when one needs the user. An agent
 * that is not built into Herdr joins in by reporting its own state through the
 * Herdr CLI it finds in its environment ("Add Herdr support to your agent"):
 *
 *   $HERDR_BIN_PATH pane report-agent $HERDR_PANE_ID --source shep --agent shep \
 *     --state working|blocked|idle --seq N [--message TEXT]
 *   $HERDR_BIN_PATH pane release-agent $HERDR_PANE_ID --source shep --agent shep --seq N
 *
 * Herdr ignores a report whose `--seq` is not higher than the last it took,
 * across restarts, so the sequence is the clock, bumped when it stands still.
 * Its guidance, followed here: never slow the agent (one call at a time, in
 * the background, short timeout), send only the latest state, ignore failures.
 */

import { AgentActivityState } from '../../../domain/generated/output.js';
import type {
  HostActivityReport,
  IActivityHostReporter,
} from '../../../application/ports/output/services/activity-host-reporter.interface.js';
import type { ExecFunction } from '../git/worktree.service.js';

/** Identifies shep's reports to Herdr; must not start with `herdr:`. */
export const HERDR_SOURCE = 'shep';
/** The name Herdr shows for the pane's agent. */
export const HERDR_AGENT_LABEL = 'shep';
/** A report that takes longer than this is abandoned. */
const HERDR_CALL_TIMEOUT_MS = 2_000;
const HERDR_ENV_MARKER = '1';

const enum HerdrState {
  Working = 'working',
  Blocked = 'blocked',
  Idle = 'idle',
}

const HERDR_STATE: Record<AgentActivityState, HerdrState> = {
  [AgentActivityState.Working]: HerdrState.Working,
  [AgentActivityState.Blocked]: HerdrState.Blocked,
  [AgentActivityState.Waiting]: HerdrState.Idle,
  [AgentActivityState.Done]: HerdrState.Idle,
  [AgentActivityState.Failed]: HerdrState.Idle,
};

export interface HerdrEnvironment {
  binPath: string;
  paneId: string;
}

/** Where to reach Herdr, when this process runs in a Herdr pane. */
export function herdrEnvironment(
  env: Readonly<Record<string, string | undefined>>
): HerdrEnvironment | undefined {
  const binPath = env.HERDR_BIN_PATH?.trim();
  const paneId = env.HERDR_PANE_ID?.trim();
  if (env.HERDR_ENV !== HERDR_ENV_MARKER || !binPath || !paneId) return undefined;
  return { binPath, paneId };
}

export class HerdrActivityReporter implements IActivityHostReporter {
  readonly available = true;
  private lastSeq = 0;
  private pending: HostActivityReport | undefined;
  private inFlight: Promise<void> | undefined;
  private released = false;

  constructor(
    private readonly exec: ExecFunction,
    private readonly herdr: HerdrEnvironment,
    private readonly now: () => number = Date.now
  ) {}

  report(report: HostActivityReport): void {
    if (this.released) return;
    this.pending = report;
    this.inFlight ??= this.drain();
  }

  async release(): Promise<void> {
    this.released = true;
    this.pending = undefined;
    await this.inFlight;
    await this.call([
      'pane',
      'release-agent',
      this.herdr.paneId,
      ...this.identity(),
      ...this.seq(),
    ]);
  }

  /** Sends the latest pending report until none is left. */
  private async drain(): Promise<void> {
    while (this.pending && !this.released) {
      const report = this.pending;
      this.pending = undefined;
      await this.call([
        'pane',
        'report-agent',
        this.herdr.paneId,
        ...this.identity(),
        '--state',
        HERDR_STATE[report.state],
        ...this.seq(),
        ...(report.message ? ['--message', report.message] : []),
      ]);
    }
    this.inFlight = undefined;
  }

  private identity(): string[] {
    return ['--source', HERDR_SOURCE, '--agent', HERDR_AGENT_LABEL];
  }

  private seq(): string[] {
    this.lastSeq = Math.max(this.now(), this.lastSeq + 1);
    return ['--seq', String(this.lastSeq)];
  }

  private async call(args: string[]): Promise<void> {
    await this.exec(this.herdr.binPath, args, {
      timeout: HERDR_CALL_TIMEOUT_MS,
      windowsHide: true,
    }).catch(() => undefined);
  }
}
