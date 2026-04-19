/**
 * Code Review by ID API Route
 *
 * GET /api/code-reviews/:id — Get a single code review by ID
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { GetCodeReviewUseCase } from '@shepai/core/application/use-cases/code-review/get-code-review.use-case';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const useCase = resolve<GetCodeReviewUseCase>('GetCodeReviewUseCase');
    const review = await useCase.execute(id);
    return NextResponse.json(review);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';

    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    // eslint-disable-next-line no-console
    console.error('[GET /api/code-reviews/:id]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
