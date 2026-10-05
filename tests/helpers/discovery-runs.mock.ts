/** In-memory discovery run repository for use-case tests (spec 128). */

import type { DiscoveryRun } from '@/domain/generated/output.js';
import type { IDiscoveryRunRepository } from '@/application/ports/output/repositories/discovery-run-repository.interface.js';

export class InMemoryDiscoveryRuns implements IDiscoveryRunRepository {
  readonly rows = new Map<string, DiscoveryRun>();
  async listBySpace(spaceId: string, limit = 20) {
    return [...this.rows.values()]
      .filter((run) => run.spaceId === spaceId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
  async latest(spaceId: string) {
    return (await this.listBySpace(spaceId, 1))[0] ?? null;
  }
  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }
  async create(run: DiscoveryRun) {
    this.rows.set(run.id, run);
  }
  async update(run: DiscoveryRun) {
    this.rows.set(run.id, run);
  }
}
