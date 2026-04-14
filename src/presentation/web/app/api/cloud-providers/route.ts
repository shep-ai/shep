/**
 * GET /api/cloud-providers
 *
 * List every known cloud deployment provider with its enabled + connected
 * flags. Powers the Deploy dropdown on the application page.
 */

import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { ListCloudProvidersUseCase } from '@shepai/core/application/use-cases/cloud-deploy/list-cloud-providers.use-case';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const useCase = resolve<ListCloudProvidersUseCase>('ListCloudProvidersUseCase');
    const providers = await useCase.execute();
    return NextResponse.json({ providers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
