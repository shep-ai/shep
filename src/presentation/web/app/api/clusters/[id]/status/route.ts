/**
 * Cluster status API route.
 *
 * GET /api/clusters/[id]/status — Get live cluster status
 */

import { NextResponse, type NextRequest } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { GetClusterStatusUseCase } from '@shepai/core/application/use-cases/clusters/get-cluster-status.use-case';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const useCase = resolve<GetClusterStatusUseCase>('GetClusterStatusUseCase');
    const result = await useCase.execute(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json(result.status);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /api/clusters/[id]/status]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
