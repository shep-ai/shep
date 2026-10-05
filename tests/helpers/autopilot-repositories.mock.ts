/** In-memory autopilot repositories (spec 132). */

import type { AutopilotPolicy, AutopilotRun } from '@/domain/generated/output.js';
import type {
  IAutopilotPolicyRepository,
  IAutopilotRunRepository,
} from '@/application/ports/output/repositories/autopilot-repository.interface.js';

export class InMemoryAutopilotPolicies implements IAutopilotPolicyRepository {
  readonly rows = new Map<string, AutopilotPolicy>();
  async find(spaceId: string) {
    return this.rows.get(spaceId) ?? null;
  }
  async list() {
    return [...this.rows.values()];
  }
  async save(policy: AutopilotPolicy) {
    this.rows.set(policy.spaceId, policy);
  }
}

export class InMemoryAutopilotRuns implements IAutopilotRunRepository {
  readonly rows: AutopilotRun[] = [];
  async listBySpace(spaceId: string, limit = 20) {
    return this.rows
      .filter((run) => run.spaceId === spaceId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
  async create(run: AutopilotRun) {
    this.rows.push(run);
  }
}
