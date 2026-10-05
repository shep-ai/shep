/** Autopilot policy and pass repositories (output ports) — spec 132. */

import type { AutopilotPolicy, AutopilotRun } from '../../../../domain/generated/output.js';

export interface IAutopilotPolicyRepository {
  /** The space's policy, or null when autopilot was never set up there. */
  find(spaceId: string): Promise<AutopilotPolicy | null>;
  list(): Promise<AutopilotPolicy[]>;
  save(policy: AutopilotPolicy): Promise<void>;
}

export interface IAutopilotRunRepository {
  /** Newest first. */
  listBySpace(spaceId: string, limit?: number): Promise<AutopilotRun[]>;
  create(run: AutopilotRun): Promise<void>;
}
