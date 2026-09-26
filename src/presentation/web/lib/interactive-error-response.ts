/**
 * HTTP mapping for the expected, user-actionable failures of starting an
 * interactive (chat) session. Shared by every route that can boot one.
 *
 * Matches on the error's stable `code`, never `instanceof` — route handlers
 * are bundled separately from the DI container (see `./error-code.ts`).
 */

import { NextResponse } from 'next/server';
import { INTERACTIVE_AGENT_UNSUPPORTED_CODE } from '@shepai/core/domain/errors/interactive-agent-unsupported.error';
import { errorCode } from './error-code';

const HTTP_UNPROCESSABLE_ENTITY = 422;

const STATUS_BY_CODE: Record<string, number> = {
  [INTERACTIVE_AGENT_UNSUPPORTED_CODE]: HTTP_UNPROCESSABLE_ENTITY,
};

/**
 * Return a `{ error, code }` response for a known session-start failure, or
 * `null` so the caller falls through to its generic 500 handling.
 */
export function interactiveSessionErrorResponse(error: unknown): NextResponse | null {
  const code = errorCode(error);
  const status = code ? STATUS_BY_CODE[code] : undefined;
  if (!code || !status) return null;
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message, code }, { status });
}
