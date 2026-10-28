/**
 * Agent activity snapshot (spec 149): GET /api/agent-activity
 *
 * The web's `shep feat status`: what each feature's agent is doing and why,
 * from GetAgentActivityUseCase — the same answer MCP, A2A and the CLI give.
 *
 * Query: `featureId` (id or prefix), `repositoryPath`, `includeSettled` (`1`).
 * 404 when `featureId` matches nothing; the body is the snapshot either way.
 */

import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { GetAgentActivityUseCase } from '@shepai/core/application/use-cases/agent-activity/get-agent-activity.use-case';
import { isFlagOn, optionalParam } from '@/lib/agent-activity-params';
import { errorMessage } from '@/lib/error-code';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const featureId = optionalParam(params, 'featureId');
  const repositoryPath = optionalParam(params, 'repositoryPath');

  try {
    const result = await resolve<GetAgentActivityUseCase>('GetAgentActivityUseCase').execute({
      ...(featureId ? { featureId } : {}),
      ...(repositoryPath ? { repositoryPath } : {}),
      includeSettled: isFlagOn(params.get('includeSettled')),
    });
    return NextResponse.json(result, { status: result.notFound ? 404 : 200 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
