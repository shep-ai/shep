/**
 * Wait for a feature's agent (spec 148): GET /api/agent-activity/wait
 *
 * The web's `shep feat wait`, behind the drawer's "Notify me": returns once the
 * feature reaches one of the `until` states (default blocked, done, failed), or
 * after `timeoutMs` (at most MAX_ACTIVITY_WAIT_MS — the caller asks again).
 * Closing the request aborts the wait.
 *
 * 200 for matched / timed-out / aborted, 404 for an unknown feature, 409 for an
 * ambiguous prefix, 400 for bad parameters.
 */

import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { WaitForAgentActivityUseCase } from '@shepai/core/application/use-cases/agent-activity/wait-for-agent-activity.use-case';
import { MAX_ACTIVITY_WAIT_MS } from '@shepai/core/application/use-cases/agent-activity/agent-activity.types';
import { ActivityWaitOutcome } from '@shepai/core/domain/generated/output';
import { optionalParam, parseActivityStates } from '@/lib/agent-activity-params';
import { errorMessage } from '@/lib/error-code';

export const dynamic = 'force-dynamic';

const STATUS_BY_OUTCOME: Partial<Record<ActivityWaitOutcome, number>> = {
  [ActivityWaitOutcome.NotFound]: 404,
  [ActivityWaitOutcome.Ambiguous]: 409,
};

function badRequest(error: string): Response {
  return NextResponse.json({ error }, { status: 400 });
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const featureId = optionalParam(params, 'featureId');
  if (!featureId) return badRequest('featureId is required');

  const until = parseActivityStates(params.get('until'));
  if (!until.ok) return badRequest(`Unknown activity state: ${until.invalid}`);

  const rawTimeout = optionalParam(params, 'timeoutMs');
  const timeoutMs = rawTimeout === undefined ? MAX_ACTIVITY_WAIT_MS : Number(rawTimeout);
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    return badRequest('timeoutMs must be a positive whole number');
  }

  try {
    const result = await resolve<WaitForAgentActivityUseCase>(
      'WaitForAgentActivityUseCase'
    ).execute({
      featureId,
      ...(until.states ? { until: until.states } : {}),
      timeoutMs: Math.min(timeoutMs, MAX_ACTIVITY_WAIT_MS),
      signal: request.signal,
    });
    return NextResponse.json(result, { status: STATUS_BY_OUTCOME[result.outcome] ?? 200 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
