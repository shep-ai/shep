/**
 * POST /api/applications/:id/cloud-deploy/initiate
 *
 * Fire-and-forget: kicks off InitiateCloudDeploymentUseCase in the background
 * and returns immediately. Status transitions stream to the client through
 * the /api/agent-events SSE loop (phase 11 extension) — this route never
 * blocks on the deploy completing.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import { errorCode, errorMessage } from '@/lib/error-code';
import type { InitiateCloudDeploymentUseCase } from '@shepai/core/application/use-cases/cloud-deploy/initiate-cloud-deployment.use-case';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const useCase = resolve<InitiateCloudDeploymentUseCase>('InitiateCloudDeploymentUseCase');
    // Fire-and-forget — the event bus + SSE delivers progress.
    void useCase.execute({ applicationId: id }).catch(() => {
      /* errors are persisted on the Application row and surfaced via SSE */
    });
    return NextResponse.json({ ok: true, accepted: true }, { status: 202 });
  } catch (error) {
    const code = errorCode(error);
    const message = errorMessage(error);
    if (code === 'APPLICATION_NOT_FOUND') {
      return NextResponse.json({ error: message, code }, { status: 404 });
    }
    if (
      code === 'NO_PROVIDER_SELECTED' ||
      code === 'CLOUD_PROVIDER_NOT_CONNECTED' ||
      code === 'BUILD_OUTPUT_NOT_FOUND'
    ) {
      return NextResponse.json({ error: message, code }, { status: 409 });
    }
    if (code === 'PROVIDER_NOT_IMPLEMENTED') {
      return NextResponse.json({ error: message, code }, { status: 501 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
