/**
 * Harness Improver (Output Port, spec 150)
 *
 * Runs one improvement session — a proposer, composer, selector or reflector —
 * as an agent working in an evidence workspace. As in Harness², the agent's
 * edits to `context/harness/` ARE the proposal; its reply carries only notes
 * (or a choice, or an experience record). Implementations resolve the agent
 * through IAgentExecutorProvider; no caller names an agent type.
 */

import type { HarnessTree } from '../../../../domain/harness-learning/harness-tree.js';

export interface ImproverMission {
  /** Stage label, e.g. `inv1`, `dom1`, `agg1`, `select`, `experience`. */
  label: string;
  /** The full mission text. */
  mission: string;
  /** Workspace root the agent runs in (holds `context/`). */
  workspaceRoot: string;
  /** Read `context/harness/` back after the session. */
  harvestHarness: boolean;
  /** Feature the improvement is about, for run attribution. */
  featureId?: string;
}

export interface ImproverReply {
  /** The agent's final text. */
  text: string;
  /** Cost of the session in USD (0 when the agent does not report it). */
  costUsd: number;
  /** The edited harness, when harvested. */
  harness?: HarnessTree;
  /** Files found under `context/harness/` that are off the editable surface. */
  rejectedPaths: string[];
}

export class ImproverError extends Error {
  constructor(
    message: string,
    readonly costUsd = 0
  ) {
    super(message);
    this.name = 'ImproverError';
  }
}

export interface IHarnessImprover {
  run(mission: ImproverMission): Promise<ImproverReply>;
}
