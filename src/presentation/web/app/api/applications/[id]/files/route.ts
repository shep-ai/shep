/**
 * GET /api/applications/[id]/files
 *
 * Returns the full directory tree for an application's repository path.
 * Used by the IDE tab's file explorer.
 */

import type { NextRequest } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { ListApplicationFilesUseCase } from '@shepai/core/application/use-cases/applications/list-application-files.use-case';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const useCase = resolve<ListApplicationFilesUseCase>('ListApplicationFilesUseCase');
    const tree = await useCase.execute({ applicationId: id });
    return Response.json({ tree });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /api/applications/:id/files]', error);
    const message = error instanceof Error ? error.message : String(error);
    const status = /not found/i.test(message) ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
