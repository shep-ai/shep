/**
 * Shared helper: resolve an Application by exact id, prefix, or slug for
 * the `shep aspm` command tree. Mirrors the shape of the equivalent
 * helper under `commands/app/` so the surfaces stay consistent.
 */

import { container } from '@/infrastructure/di/container.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { Application } from '@/domain/generated/output.js';

export async function resolveApplication(
  idOrSlug: string
): Promise<{ application: Application } | { error: string }> {
  const repo = container.resolve<IApplicationRepository>('IApplicationRepository');

  const exact = await repo.findById(idOrSlug);
  if (exact) return { application: exact };

  const bySlug = await repo.findBySlug(idOrSlug);
  if (bySlug) return { application: bySlug };

  if (idOrSlug.length < 36) {
    const all = await repo.list();
    const matches = all.filter((a) => a.id.startsWith(idOrSlug));
    if (matches.length === 1) return { application: matches[0] };
    if (matches.length > 1) {
      return {
        error: `Multiple applications match "${idOrSlug}": ${matches
          .map((m) => m.id.substring(0, 8))
          .join(', ')}`,
      };
    }
  }

  return { error: `Application not found: ${idOrSlug}` };
}
