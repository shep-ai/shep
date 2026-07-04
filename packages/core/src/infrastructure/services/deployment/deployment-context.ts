/**
 * Shared context passed to the deployment helper modules (status reads,
 * graceful stop, recovery): the in-memory registry, the dev_servers store,
 * and the process probes from DeploymentServiceDeps.
 */

import type { DeploymentEntry } from './deployment-entry.js';
import type { DeploymentDbStore } from './deployment-db-store.js';

export interface DeploymentContext {
  deployments: Map<string, DeploymentEntry>;
  dbStore: DeploymentDbStore;
  isAlive(pid: number): boolean;
  kill(pid: number, signal: NodeJS.Signals | string): void;
}
