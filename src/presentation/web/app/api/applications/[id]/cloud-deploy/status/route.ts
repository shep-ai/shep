/**
 * GET /api/applications/:id/cloud-deploy/status
 *
 * Returns the persisted cloud deployment status DTO for the application.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { GetCloudDeploymentStatusUseCase } from '@shepai/core/application/use-cases/cloud-deploy/get-cloud-deployment-status.use-case';
import { ApplicationNotFoundError } from '@shepai/core/application/use-cases/cloud-deploy/select-cloud-provider.use-case';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const useCase = resolve<GetCloudDeploymentStatusUseCase>('GetCloudDeploymentStatusUseCase');
    const dto = await useCase.execute(id);
    return NextResponse.json(dto);
  } catch (error) {
    if (error instanceof ApplicationNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
