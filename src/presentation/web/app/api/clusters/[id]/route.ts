/**
 * Single cluster API routes.
 *
 * GET    /api/clusters/[id]  — Get cluster by ID
 * PATCH  /api/clusters/[id]  — Update cluster
 * DELETE /api/clusters/[id]  — Delete cluster
 */

import { NextResponse, type NextRequest } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { GetClusterUseCase } from '@shepai/core/application/use-cases/clusters/get-cluster.use-case';
import type { UpdateClusterUseCase } from '@shepai/core/application/use-cases/clusters/update-cluster.use-case';
import type { DeleteClusterUseCase } from '@shepai/core/application/use-cases/clusters/delete-cluster.use-case';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const useCase = resolve<GetClusterUseCase>('GetClusterUseCase');
    const result = await useCase.execute(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json(result.cluster);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /api/clusters/[id]]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      argoCdEnabled?: boolean;
    };

    const useCase = resolve<UpdateClusterUseCase>('UpdateClusterUseCase');
    const result = await useCase.execute(id, body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result.cluster);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[PATCH /api/clusters/[id]]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const useCase = resolve<DeleteClusterUseCase>('DeleteClusterUseCase');
    const result = await useCase.execute(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[DELETE /api/clusters/[id]]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
