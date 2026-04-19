/**
 * Code Review API Routes
 *
 * POST /api/code-reviews — Trigger a new code review
 * GET  /api/code-reviews — List code reviews with optional featureId filter
 */

import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { RunCodeReviewUseCase } from '@shepai/core/application/use-cases/code-review/run-code-review.use-case';
import type { ListCodeReviewsUseCase } from '@shepai/core/application/use-cases/code-review/list-code-reviews.use-case';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { target, owner, repo, repositoryPath, featureId } = body as {
      target?: string;
      owner?: string;
      repo?: string;
      repositoryPath?: string;
      featureId?: string;
    };

    if (!target) {
      return NextResponse.json({ error: 'target is required (PR number or URL)' }, { status: 400 });
    }

    const useCase = resolve<RunCodeReviewUseCase>('RunCodeReviewUseCase');
    const result = await useCase.execute({
      target,
      owner,
      repo,
      repositoryPath,
      featureId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json(result.review, { status: 201 });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/code-reviews]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const featureId = url.searchParams.get('featureId') ?? undefined;
    const repositoryPath = url.searchParams.get('repositoryPath') ?? undefined;
    const limit = url.searchParams.get('limit');

    const useCase = resolve<ListCodeReviewsUseCase>('ListCodeReviewsUseCase');
    const reviews = await useCase.execute({
      featureId,
      repositoryPath,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    return NextResponse.json(reviews);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /api/code-reviews]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
