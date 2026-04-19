/**
 * Post Code Review to GitHub API Route
 *
 * POST /api/code-reviews/:id/post — Post a completed review to GitHub
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { PostCodeReviewUseCase } from '@shepai/core/application/use-cases/code-review/post-code-review.use-case';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const useCase = resolve<PostCodeReviewUseCase>('PostCodeReviewUseCase');
    const review = await useCase.execute(id);
    return NextResponse.json(review);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';

    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes('Cannot post')) {
      return NextResponse.json({ error: message }, { status: 422 });
    }

    // eslint-disable-next-line no-console
    console.error('[POST /api/code-reviews/:id/post]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
