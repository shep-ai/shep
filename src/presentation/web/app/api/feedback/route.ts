/**
 * Feedback endpoint (spec 127): POST /api/feedback
 *
 * A support tool, widget or script posts customer feedback with a space
 * intake key (`Authorization: Bearer shep_fb_…`); it lands as a Feedback
 * signal in the key's space. This route verifies the key itself, so the
 * request guard exempts this exact path from the session token and loopback
 * checks. Status codes: see lib/intake-route.ts.
 */

import { resolve } from '@/lib/server-container';
import { handleIntake, intakeDisabled } from '@/lib/intake-route';
import { getFeatureFlags } from '@/lib/feature-flags';
import type { IngestFeedbackUseCase } from '@shepai/core/application/use-cases/feedback/ingest-feedback.use-case';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!getFeatureFlags().feedback) return intakeDisabled();
  return handleIntake(request, async (secret, payload) => {
    const result = await resolve<IngestFeedbackUseCase>('IngestFeedbackUseCase').execute(
      secret,
      payload
    );
    return result.ok ? { ok: true, id: result.signal.id, duplicate: result.duplicate } : result;
  });
}
