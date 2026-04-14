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
import { errorCode, errorField, errorMessage } from '@/lib/error-code';
import type { CreateGitRemoteUseCase } from '@shepai/core/application/use-cases/cloud-deploy/create-git-remote.use-case';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface CreateRemoteBody {
  ownerLogin?: string;
  repoName?: string;
  visibility?: 'public' | 'private';
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    let body: CreateRemoteBody = {};
    try {
      const raw = (await request.json()) as unknown;
      if (raw && typeof raw === 'object') {
        body = raw as CreateRemoteBody;
      }
    } catch {
      // empty/invalid body — accept and fall back to defaults
    }
    const useCase = resolve<CreateGitRemoteUseCase>('CreateGitRemoteUseCase');
    const result = await useCase.execute({
      applicationId: id,
      ownerLogin: body.ownerLogin,
      repoName: body.repoName,
      visibility: body.visibility,
    });
    return NextResponse.json(result);
  } catch (error) {
    const code = errorCode(error);
    const message = errorMessage(error);
    if (code === 'GH_NOT_AUTHENTICATED') {
      return NextResponse.json({ error: message, code }, { status: 409 });
    }
    if (code === 'GH_REPO_NAME_TAKEN') {
      return NextResponse.json(
        {
          error: message,
          code,
          ownerLogin: errorField(error, 'ownerLogin'),
          repoName: errorField(error, 'repoName'),
        },
        { status: 409 }
      );
    }
    if (code === 'APPLICATION_NOT_FOUND') {
      return NextResponse.json({ error: message, code }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
