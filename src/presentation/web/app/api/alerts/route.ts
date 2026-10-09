/**
 * Alert endpoint (spec 129): POST /api/alerts
 *
 * A monitoring tool posts an alert with a space intake key (the keys feedback
 * uses); it opens an incident in the key's space, or adds a note to the
 * unresolved incident opened by the same external id. This route verifies the
 * key itself, so the request guard exempts this exact path. Status codes: see
 * lib/intake-route.ts.
 */

import { resolve } from '@/lib/server-container';
import { handleIntake, intakeDisabled } from '@/lib/intake-route';
import { getFeatureFlags } from '@/lib/feature-flags';
import type { IngestAlertUseCase } from '@shepai/core/application/use-cases/incidents/ingest-alert.use-case';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!getFeatureFlags().incidents) return intakeDisabled();
  return handleIntake(request, async (secret, payload) => {
    const result = await resolve<IngestAlertUseCase>('IngestAlertUseCase').execute(secret, payload);
    return result.ok ? { ok: true, id: result.incident.id, duplicate: result.duplicate } : result;
  });
}
