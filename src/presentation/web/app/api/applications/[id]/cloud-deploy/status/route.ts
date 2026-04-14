/**
 * GET /api/applications/:id/cloud-deploy/status
 *
 * Returns the persisted cloud deployment status DTO for the application.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import { errorCode, errorMessage } from '@/lib/error-code';
import type { GetCloudDeploymentStatusUseCase } from '@shepai/core/application/use-cases/cloud-deploy/get-cloud-deployment-status.use-case';

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
    const code = errorCode(error);
    const message = errorMessage(error);
    if (code === 'APPLICATION_NOT_FOUND') {
      return NextResponse.json({ error: message, code }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
