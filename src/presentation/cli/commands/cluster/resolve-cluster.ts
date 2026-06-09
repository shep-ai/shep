/**
 * Shared helper: resolve a cluster by exact ID, prefix, or slug.
 */

import { container } from '@/infrastructure/di/container.js';
import type { IClusterRepository } from '@/application/ports/output/repositories/cluster-repository.interface.js';
import type { Cluster } from '@/domain/generated/output.js';
import { getCliI18n } from '../../i18n.js';

export async function resolveCluster(
  id: string
): Promise<{ cluster: Cluster } | { error: string }> {
  const t = getCliI18n().t;
  const repo = container.resolve<IClusterRepository>('IClusterRepository');

  // Try exact ID match first
  const exact = await repo.findById(id);
  if (exact) return { cluster: exact };

  // Try slug match
  const bySlug = await repo.findBySlug(id);
  if (bySlug) return { cluster: bySlug };

  // Try prefix match on ID
  if (id.length < 36) {
    const all = await repo.list();
    const matches = all.filter((c) => c.id.startsWith(id));

    if (matches.length === 1) return { cluster: matches[0] };
    if (matches.length > 1) {
      return {
        error: t('cli:commands.cluster.resolve.multipleMatch', {
          id,
          matches: matches.map((m) => m.id.substring(0, 8)).join(', '),
        }),
      };
    }
  }

  return { error: t('cli:commands.cluster.resolve.notFound', { id }) };
}
