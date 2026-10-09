/**
 * Telemetry Identity Provider Port (spec 133)
 *
 * Resolves the identity attached to events when the user keeps "Include my
 * identity" on. Every field is optional: a missing agent login, a missing or
 * unauthenticated `gh`, or no GitHub remotes simply leave it out.
 */

import type { AgentType } from '../../../../domain/generated/output.js';

export interface TelemetryIdentity {
  /** SHA-256 hex of `<agentType>:<accountId>` — the raw id never leaves the reader. */
  agentAccountHash?: string;
  /** Which agent the hash came from. */
  agentAccountSource?: AgentType;
  /** GitHub login from `gh api user`. */
  githubUsername?: string;
  /** GitHub owners (users/orgs) of the repositories Shep runs in; never repository names. */
  githubOwners: string[];
}

export interface ITelemetryIdentityProvider {
  /** @param preferredAgent - the configured agent, tried first for the account hash */
  resolve(preferredAgent: AgentType): Promise<TelemetryIdentity>;
}
