/**
 * Shared helper: resolve an application by exact ID, prefix, or slug.
 */

import { container } from '@/infrastructure/di/container.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { Application } from '@/domain/generated/output.js';
import { getCliI18n } from '../../i18n.js';

export async function resolveApplication(
  id: string
): Promise<{ application: Application } | { error: string }> {
  const t = getCliI18n().t;
  const repo = container.resolve<IApplicationRepository>('IApplicationRepository');

  // Try exact ID match first
  const exact = await repo.findById(id);
  if (exact) return { application: exact };

  // Try slug match
  const bySlug = await repo.findBySlug(id);
  if (bySlug) return { application: bySlug };

  // Try prefix match on ID
  if (id.length < 36) {
    const all = await repo.list();
    const matches = all.filter((a) => a.id.startsWith(id));

    if (matches.length === 1) return { application: matches[0] };
    if (matches.length > 1) {
      return {
        error: t('cli:commands.app.resolve.multipleMatch', {
          id,
          matches: matches.map((m) => m.id.substring(0, 8)).join(', '),
        }),
      };
    }
  }

  return { error: t('cli:commands.app.resolve.notFound', { id }) };
}
