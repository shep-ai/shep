/**
 * Feedback endpoint (spec 127): POST /api/feedback
 *
 * A support tool, widget or script posts customer feedback with a feedback
 * key (`Authorization: Bearer shep_fb_…`); it lands as a Feedback signal in
 * the key's space. This route verifies the key itself, so the request guard
 * exempts this exact path from the session token and loopback checks.
 *
 * 201 recorded · 200 already recorded (same externalId) · 400 bad payload ·
 * 401 bad key · 413 body too large · 405 any other method.
 */

import { resolve } from '@/lib/server-container';
import { MAX_FEEDBACK_BYTES } from '@/lib/feedback-limits';
import { FeedbackRejection } from '@shepai/core/domain/generated/output';
import type {
  FeedbackPayload,
  IngestFeedbackUseCase,
} from '@shepai/core/application/use-cases/feedback/ingest-feedback.use-case';

export const dynamic = 'force-dynamic';

const BEARER = /^Bearer\s+(\S+)$/i;
const STATUS = {
  created: 201,
  duplicate: 200,
  invalid: 400,
  unauthorized: 401,
  tooLarge: 413,
} as const;

function bearer(request: Request): string {
  return BEARER.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
}

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_FEEDBACK_BYTES) {
    return Response.json({ error: 'Body too large.' }, { status: STATUS.tooLarge });
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_FEEDBACK_BYTES) {
    return Response.json({ error: 'Body too large.' }, { status: STATUS.tooLarge });
  }
  let payload: FeedbackPayload;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
    payload = parsed as FeedbackPayload;
  } catch {
    return Response.json({ error: 'Send a JSON object.' }, { status: STATUS.invalid });
  }

  const result = await resolve<IngestFeedbackUseCase>('IngestFeedbackUseCase').execute(
    bearer(request),
    payload
  );
  if (!result.ok) {
    const status =
      result.rejection === FeedbackRejection.Unauthorized ? STATUS.unauthorized : STATUS.invalid;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json(
    { id: result.signal.id, duplicate: result.duplicate },
    { status: result.duplicate ? STATUS.duplicate : STATUS.created }
  );
}
