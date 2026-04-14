/**
 * GET /api/applications/:id/git/status
 *
 * Returns the live snapshot of the application's local working tree —
 * branch, uncommitted count, unpushed count, has-remote flag, remote URL.
 * Polled every few seconds by the SmartDeployButton hook so the label
 * reacts to drift without a manual refresh.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import { errorCode, errorMessage } from '@/lib/error-code';
import type { GetGitStatusUseCase } from '@shepai/core/application/use-cases/cloud-deploy/get-git-status.use-case';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const useCase = resolve<GetGitStatusUseCase>('GetGitStatusUseCase');
    const status = await useCase.execute({ applicationId: id });
    return NextResponse.json(status);
  } catch (error) {
    const code = errorCode(error);
    const message = errorMessage(error);
    if (code === 'APPLICATION_NOT_FOUND') {
      return NextResponse.json({ error: message, code }, { status: 404 });
    }
    return NextResponse.json({ error: message, code }, { status: 500 });
  }
}
