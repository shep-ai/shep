/** Discovery run repository (output port) — spec 128. */

import type { DiscoveryRun } from '../../../../domain/generated/output.js';

export interface IDiscoveryRunRepository {
  /** A space's runs, newest first. */
  listBySpace(spaceId: string, limit?: number): Promise<DiscoveryRun[]>;
  /** The space's newest run, or null before its first. */
  latest(spaceId: string): Promise<DiscoveryRun | null>;
  findById(id: string): Promise<DiscoveryRun | null>;
  create(run: DiscoveryRun): Promise<void>;
  update(run: DiscoveryRun): Promise<void>;
}
