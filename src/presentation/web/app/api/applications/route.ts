/**
 * List all applications with effective status.
 *
 * GET /api/applications
 */

import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { ListApplicationsUseCase } from '@shepai/core/application/use-cases/applications/list-applications.use-case';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const useCase = resolve<ListApplicationsUseCase>('ListApplicationsUseCase');
    const apps = await useCase.execute();
    return NextResponse.json(apps);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /api/applications]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
