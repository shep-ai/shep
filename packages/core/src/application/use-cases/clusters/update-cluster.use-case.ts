import { injectable, inject } from 'tsyringe';
import type { IClusterRepository } from '../../ports/output/repositories/cluster-repository.interface.js';
import type { UpdateClusterInput, UpdateClusterResult } from './types.js';

@injectable()
export class UpdateClusterUseCase {
  constructor(@inject('IClusterRepository') private readonly clusterRepo: IClusterRepository) {}

  async execute(id: string, input: UpdateClusterInput): Promise<UpdateClusterResult> {
    const cluster = await this.clusterRepo.findById(id);
    if (!cluster) {
      return { ok: false, error: `Cluster not found: "${id}"` };
    }

    const fields: Record<string, unknown> = {};

    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (!trimmed) {
        return { ok: false, error: 'Cluster name cannot be empty.' };
      }
      fields.name = trimmed;
      // Regenerate slug when name changes
      fields.slug = trimmed
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    }

    if (input.description !== undefined) {
      fields.description = input.description;
    }

    if (input.argoCdEnabled !== undefined) {
      fields.argoCdEnabled = input.argoCdEnabled;
    }

    if (input.argoCdNamespace !== undefined) {
      fields.argoCdNamespace = input.argoCdNamespace;
    }

    await this.clusterRepo.update(id, fields);
    const updated = await this.clusterRepo.findById(id);
    return { ok: true, cluster: updated! };
  }
}
