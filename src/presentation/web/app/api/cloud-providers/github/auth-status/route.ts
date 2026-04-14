/**
 * GET /api/cloud-providers/github/auth-status
 *
 * Returns { authenticated: boolean } based on the local `gh` CLI state.
 */

import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { EnsureGhAuthenticatedUseCase } from '@shepai/core/application/use-cases/cloud-deploy/ensure-gh-authenticated.use-case';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const useCase = resolve<EnsureGhAuthenticatedUseCase>('EnsureGhAuthenticatedUseCase');
    const result = await useCase.execute();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
