/**
 * POST /api/applications/:id/git/create-remote
 *
 * Creates a GitHub repository via `gh` CLI, pushes the local repository,
 * and persists the remote URL on the Application row.
 *
 * On GH_NOT_AUTHENTICATED → returns 409 with that code so the UI can
 * transition to the "Sign in with GitHub" flow.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { CreateGitRemoteUseCase } from '@shepai/core/application/use-cases/cloud-deploy/create-git-remote.use-case';
import { ApplicationNotFoundError } from '@shepai/core/application/use-cases/cloud-deploy/select-cloud-provider.use-case';
import { GhNotAuthenticatedError } from '@shepai/core/application/ports/output/services/git-remote.service.interface';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const useCase = resolve<CreateGitRemoteUseCase>('CreateGitRemoteUseCase');
    const result = await useCase.execute(id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof GhNotAuthenticatedError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    if (error instanceof ApplicationNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
