import { injectable, inject } from 'tsyringe';
import { randomUUID } from 'node:crypto';
import { ClusterStatus } from '../../../domain/generated/output.js';
import type { IClusterRepository } from '../../ports/output/repositories/cluster-repository.interface.js';
import type { IClusterAgentProcessService } from '../../ports/output/services/cluster-agent-process-service.interface.js';
import type { ProvisionClusterResult } from './types.js';

/** Statuses from which provisioning can be initiated. */
const PROVISIONABLE_STATUSES = new Set<ClusterStatus>([ClusterStatus.Stopped, ClusterStatus.Error]);

@injectable()
export class ProvisionClusterUseCase {
  constructor(
    @inject('IClusterRepository') private readonly clusterRepo: IClusterRepository,
    @inject('IClusterAgentProcessService')
    private readonly processService: IClusterAgentProcessService
  ) {}

  async execute(id: string): Promise<ProvisionClusterResult> {
    const cluster = await this.clusterRepo.findById(id);
    if (!cluster) {
      return { ok: false, error: `Cluster not found: "${id}"` };
    }

    if (!PROVISIONABLE_STATUSES.has(cluster.status)) {
      return {
        ok: false,
        error: `Cluster cannot be provisioned from "${cluster.status}" status. Must be Stopped or Error.`,
      };
    }

    // Transition to Provisioning
    await this.clusterRepo.update(id, {
      status: ClusterStatus.Provisioning,
      errorMessage: undefined,
    });

    // Spawn background worker (non-blocking)
    const runId = randomUUID();
    this.processService.spawn(id, runId, {
      argoCdEnabled: cluster.argoCdEnabled,
      argoCdNamespace: cluster.argoCdNamespace,
    });

    return { ok: true };
  }
}
