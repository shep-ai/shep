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
import {
  CloudDeploymentProvider,
  type CloudDeploymentProvider as CloudDeploymentProviderType,
} from '@shepai/core/domain/generated/output';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function parseProvider(raw: unknown): CloudDeploymentProviderType | null {
  if (typeof raw !== 'string') return null;
  const allowed = Object.values(CloudDeploymentProvider) as string[];
  return allowed.includes(raw) ? (raw as CloudDeploymentProviderType) : null;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = (await request.json()) as { provider?: unknown };
    const provider = parseProvider(body.provider);
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
