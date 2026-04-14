/**
 * POST /api/cloud-providers/:provider/connect
 *
 * Body: { token: string }
 *
 * Validates the token against the provider and persists it encrypted.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import { errorCode, errorMessage } from '@/lib/error-code';
import type { ConnectCloudProviderUseCase } from '@shepai/core/application/use-cases/cloud-deploy/connect-cloud-provider.use-case';
import {
  CloudDeploymentProvider,
  type CloudDeploymentProvider as CloudDeploymentProviderType,
} from '@shepai/core/domain/generated/output';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ provider: string }>;
}

function parseProvider(raw: string): CloudDeploymentProviderType | null {
  const allowed = Object.values(CloudDeploymentProvider) as string[];
  return allowed.includes(raw) ? (raw as CloudDeploymentProviderType) : null;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { provider: raw } = await params;
    const provider = parseProvider(raw);
    if (!provider) {
      return NextResponse.json({ error: `Unknown provider: ${raw}` }, { status: 400 });
    }
    const body = (await request.json()) as { token?: unknown };
    if (typeof body.token !== 'string' || body.token.trim().length === 0) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }
    const useCase = resolve<ConnectCloudProviderUseCase>('ConnectCloudProviderUseCase');
    await useCase.execute({ provider, token: body.token.trim() });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = errorCode(error);
    const message = errorMessage(error);
    if (code === 'PROVIDER_NOT_IMPLEMENTED') {
      return NextResponse.json({ error: message, code }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
