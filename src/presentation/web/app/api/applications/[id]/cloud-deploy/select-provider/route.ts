/**
 * POST /api/applications/:id/cloud-deploy/select-provider
 *
 * Body: { provider: CloudDeploymentProvider }
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import { errorCode, errorMessage } from '@/lib/error-code';
import type { SelectCloudProviderUseCase } from '@shepai/core/application/use-cases/cloud-deploy/select-cloud-provider.use-case';
import { parseCloudDeploymentProvider } from '@shepai/core/domain/shared/cloud-deployment-provider';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = (await request.json()) as { provider?: unknown };
    const provider = parseCloudDeploymentProvider(body.provider);
    if (!provider) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }
    const useCase = resolve<SelectCloudProviderUseCase>('SelectCloudProviderUseCase');
    await useCase.execute({ applicationId: id, provider });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = errorCode(error);
    const message = errorMessage(error);
    if (code === 'APPLICATION_NOT_FOUND') {
      return NextResponse.json({ error: message, code }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
