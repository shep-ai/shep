/**
 * Cluster link/unlink API routes.
 *
 * POST   /api/clusters/[id]/link  — Link a repository or application
 * DELETE /api/clusters/[id]/link  — Unlink a repository or application
 */

import { NextResponse, type NextRequest } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { LinkRepositoryUseCase } from '@shepai/core/application/use-cases/clusters/link-repository.use-case';
import type { UnlinkRepositoryUseCase } from '@shepai/core/application/use-cases/clusters/unlink-repository.use-case';
import type { LinkApplicationUseCase } from '@shepai/core/application/use-cases/clusters/link-application.use-case';
import type { UnlinkApplicationUseCase } from '@shepai/core/application/use-cases/clusters/unlink-application.use-case';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      entityId?: string;
      entityType?: 'repository' | 'application';
    };

    if (!body.entityId || !body.entityType) {
      return NextResponse.json({ error: 'entityId and entityType are required' }, { status: 400 });
    }

    if (body.entityType === 'repository') {
      const useCase = resolve<LinkRepositoryUseCase>('LinkRepositoryUseCase');
      const result = await useCase.execute({ clusterId: id, entityId: body.entityId });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json(result.link, { status: 201 });
    }

    const useCase = resolve<LinkApplicationUseCase>('LinkApplicationUseCase');
    const result = await useCase.execute({ clusterId: id, entityId: body.entityId });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result.link, { status: 201 });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/clusters/[id]/link]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      entityId?: string;
      entityType?: 'repository' | 'application';
    };

    if (!body.entityId || !body.entityType) {
      return NextResponse.json({ error: 'entityId and entityType are required' }, { status: 400 });
    }

    if (body.entityType === 'repository') {
      const useCase = resolve<UnlinkRepositoryUseCase>('UnlinkRepositoryUseCase');
      await useCase.execute({ clusterId: id, entityId: body.entityId });
    } else {
      const useCase = resolve<UnlinkApplicationUseCase>('UnlinkApplicationUseCase');
      await useCase.execute({ clusterId: id, entityId: body.entityId });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[DELETE /api/clusters/[id]/link]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
