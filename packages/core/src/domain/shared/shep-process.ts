/**
 * Shep process rules (spec 144): whether a recorded process should be alive,
 * what its state is, and the order `shep ps` lists processes in.
 */

import { AgentRunStatus, ShepProcessKind, ShepProcessState } from '../generated/output';

/** Run statuses whose worker process should still be running. */
const LIVE_PROCESS_STATUSES: ReadonlySet<AgentRunStatus> = new Set([
  AgentRunStatus.running,
  AgentRunStatus.pending,
]);

/** True when a run in this status should have a live worker process. */
export function expectsLiveProcess(status: AgentRunStatus): boolean {
  return LIVE_PROCESS_STATUSES.has(status);
}

/** A process's state from whether it is alive and whether its record expects it to be. */
export function shepProcessState(alive: boolean, expectedAlive: boolean): ShepProcessState {
  if (alive) return ShepProcessState.Running;
  return expectedAlive ? ShepProcessState.Crashed : ShepProcessState.Exited;
}

const STATE_ORDER: Record<ShepProcessState, number> = {
  [ShepProcessState.Running]: 0,
  [ShepProcessState.Crashed]: 1,
  [ShepProcessState.Exited]: 2,
};

interface Sortable {
  kind: ShepProcessKind;
  state: ShepProcessState;
  startedAt?: Date;
}

/** The daemon first, then running, crashed and exited processes; newest first within each. */
export function compareShepProcesses(a: Sortable, b: Sortable): number {
  const daemon =
    Number(b.kind === ShepProcessKind.Daemon) - Number(a.kind === ShepProcessKind.Daemon);
  if (daemon !== 0) return daemon;
  const state = STATE_ORDER[a.state] - STATE_ORDER[b.state];
  if (state !== 0) return state;
  return (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0);
}
