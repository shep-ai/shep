/**
 * Cluster provision API route.
 *
 * POST /api/clusters/[id]/provision — Start provisioning a cluster
 */

import { NextResponse, type NextRequest } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { ProvisionClusterUseCase } from '@shepai/core/application/use-cases/clusters/provision-cluster.use-case';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const useCase = resolve<ProvisionClusterUseCase>('ProvisionClusterUseCase');
    const result = await useCase.execute(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/clusters/[id]/provision]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
