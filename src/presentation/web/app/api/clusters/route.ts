/**
 * Cluster API routes.
 *
 * GET  /api/clusters     — List all clusters
 * POST /api/clusters     — Create a new cluster
 */

import { NextResponse, type NextRequest } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { ListClustersUseCase } from '@shepai/core/application/use-cases/clusters/list-clusters.use-case';
import type { CreateClusterUseCase } from '@shepai/core/application/use-cases/clusters/create-cluster.use-case';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const useCase = resolve<ListClustersUseCase>('ListClustersUseCase');
    const clusters = await useCase.execute();
    return NextResponse.json(clusters);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /api/clusters]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      argoCdEnabled?: boolean;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Cluster name is required' }, { status: 400 });
    }

    const useCase = resolve<CreateClusterUseCase>('CreateClusterUseCase');
    const result = await useCase.execute({
      name: body.name.trim(),
      description: body.description,
      argoCdEnabled: body.argoCdEnabled,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.cluster, { status: 201 });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/clusters]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
