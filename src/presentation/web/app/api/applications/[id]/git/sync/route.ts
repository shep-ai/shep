/**
 * POST /api/applications/:id/git/sync
 *
 * Stages, commits, and pushes any local changes through SyncRepoUseCase.
 * Body (optional): `{ message?: string }` — overrides the default
 * `chore(shep): sync local changes` commit message.
 *
 * Returns `{ headSha, committed, pushed }` on success. All progress and
 * errors are persisted to the operation log under the `RepoSync` kind so
 * the UI can render the full history in the OperationLogsDrawer.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import { errorCode, errorMessage } from '@/lib/error-code';
import type { SyncRepoUseCase } from '@shepai/core/application/use-cases/cloud-deploy/sync-repo.use-case';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { message?: unknown };
    const message =
      typeof body.message === 'string' && body.message.trim().length > 0
        ? body.message.trim()
        : undefined;
    const useCase = resolve<SyncRepoUseCase>('SyncRepoUseCase');
    const result = await useCase.execute({ applicationId: id, message });
    return NextResponse.json({
      headSha: result.headSha,
      committed: result.committed,
      pushed: result.pushed,
    });
  } catch (error) {
    const code = errorCode(error);
    const message = errorMessage(error);
    if (code === 'APPLICATION_NOT_FOUND') {
      return NextResponse.json({ error: message, code }, { status: 404 });
    }
    if (code === 'GH_NOT_AUTHENTICATED') {
      return NextResponse.json({ error: message, code }, { status: 401 });
    }
    if (code === 'GIT_REMOTE_CREATION_FAILED') {
      // Common subtypes: no remote, no upstream, push rejected.
      return NextResponse.json({ error: message, code }, { status: 409 });
    }
    return NextResponse.json({ error: message, code }, { status: 500 });
  }
}
