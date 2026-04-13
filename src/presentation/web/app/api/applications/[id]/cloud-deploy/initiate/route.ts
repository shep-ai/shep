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
import type { InitiateCloudDeploymentUseCase } from '@shepai/core/application/use-cases/cloud-deploy/initiate-cloud-deployment.use-case';
import { ApplicationNotFoundError } from '@shepai/core/domain/errors/application-not-found.error';
import { ApplicationNotReadyError } from '@shepai/core/domain/errors/application-not-ready.error';
import { NoProviderSelectedError } from '@shepai/core/domain/errors/no-provider-selected.error';
import { BuildOutputNotFoundError } from '@shepai/core/domain/errors/build-output-not-found.error';
import { CloudProviderNotConnectedError } from '@shepai/core/domain/errors/cloud-provider-not-connected.error';
import { ProviderNotImplementedError } from '@shepai/core/domain/errors/provider-not-implemented.error';

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
    if (error instanceof ApplicationNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (
      error instanceof ApplicationNotReadyError ||
      error instanceof NoProviderSelectedError ||
      error instanceof CloudProviderNotConnectedError ||
      error instanceof BuildOutputNotFoundError
    ) {
      return NextResponse.json(
        { error: error.message, code: (error as Error & { code?: string }).code },
        { status: 409 }
      );
    }
    if (error instanceof ProviderNotImplementedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 501 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
