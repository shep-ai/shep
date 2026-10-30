/**
 * Harness Improver (Output Port, spec 150)
 *
 * Runs one improvement session — a proposer, composer, selector or reflector —
 * as an agent working in an evidence workspace. As in Harness², the agent's
 * edits to `context/harness/` ARE the proposal; its reply carries only notes
 * (or a choice, or an experience record). The adapter renders the mission for
 * the stage and resolves the agent through IAgentExecutorProvider; no caller
 * names an agent type or writes prompt text.
 */

import type {
  HarnessEditDimension,
  HarnessImproverStage,
} from '../../../../domain/generated/output.js';

/** What the improver is asked to do. */
export interface ImproverStageSpec {
  stage: HarnessImproverStage;
  /** Propose: which dimension this candidate owns. */
  dimension?: HarnessEditDimension;
  /** Task-level budget k (1 for Reflect). */
  k: number;
  /** 1-based index among parallel peers, or the round in sequential mode. */
  index: number;
  /** Sequential rounds: this is round `index` of `k`, editing the previous checkpoint. */
  sequential?: boolean;
  /** Select: the anonymous candidate ids on disk. */
  candidateIds?: string[];
  /** Reflect mode: no edited harness was executed; say so in the mission. */
  untested?: boolean;
  /** Maximum characters of always-on text, stated in the mission. */
  alwaysOnCharCap: number;
}

export interface ImproverMission {
  /** Stage label, e.g. `inv1`, `dom1`, `agg1`, `select`, `experience`. */
  label: string;
  spec: ImproverStageSpec;
  /** Workspace root the agent runs in (holds `context/`); edits are read back from it. */
  workspaceRoot: string;
  /** Why the previous attempt was rejected; appended to the mission on a retry. */
  retryFeedback?: string;
  /** Feature the improvement is about, for run attribution. */
  featureId?: string;
}

export interface ImproverReply {
  /** The agent's final text. */
  text: string;
  /** Cost of the session in USD (0 when the agent does not report it). */
  costUsd: number;
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
