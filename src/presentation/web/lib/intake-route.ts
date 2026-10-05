/**
 * Intake routes (specs 127, 129): the shared handling of endpoints tools post
 * to with a space intake key — POST /api/feedback and POST /api/alerts. A
 * body over MAX_INTAKE_BYTES is refused before and after reading, the body
 * must be a JSON object, and the bearer key goes to the use case.
 *
 * 201 recorded · 200 already recorded · 400 bad payload · 401 bad key ·
 * 413 body too large.
 */

import { IntakeRejection } from '@shepai/core/domain/generated/output';

/** Largest request body an intake endpoint accepts, in bytes. */
export const MAX_INTAKE_BYTES = 16 * 1024;

const BEARER = /^Bearer\s+(\S+)$/i;
const STATUS = {
  created: 201,
  duplicate: 200,
  invalid: 400,
  unauthorized: 401,
  tooLarge: 413,
} as const;

export type IntakeOutcome =
  | { ok: true; id: string; duplicate: boolean }
  | { ok: false; rejection: IntakeRejection; error: string };

function tooLarge(): Response {
  return Response.json({ error: 'Body too large.' }, { status: STATUS.tooLarge });
}

export async function handleIntake(
  request: Request,
  ingest: (secret: string, payload: Record<string, unknown>) => Promise<IntakeOutcome>
): Promise<Response> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_INTAKE_BYTES) return tooLarge();
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_INTAKE_BYTES) return tooLarge();
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
    payload = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Send a JSON object.' }, { status: STATUS.invalid });
  }

  const secret = BEARER.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
  const outcome = await ingest(secret, payload);
  if (!outcome.ok) {
    const status =
      outcome.rejection === IntakeRejection.Unauthorized ? STATUS.unauthorized : STATUS.invalid;
    return Response.json({ error: outcome.error }, { status });
  }
  return Response.json(
    { id: outcome.id, duplicate: outcome.duplicate },
    { status: outcome.duplicate ? STATUS.duplicate : STATUS.created }
  );
}
