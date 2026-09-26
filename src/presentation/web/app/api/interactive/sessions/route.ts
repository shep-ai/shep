/**
 * POST /api/interactive/sessions
 *
 * Start a new interactive agent session for a feature.
 * Returns 201 with { sessionId, status } on success.
 * Returns 429 when the concurrent session cap is reached.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { StartInteractiveSessionUseCase } from '@shepai/core/application/use-cases/interactive/start-interactive-session.use-case';
import { CONCURRENT_SESSION_LIMIT_CODE } from '@shepai/core/domain/errors/concurrent-session-limit.error';
import { errorCode } from '@/lib/error-code';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as {
      featureId?: string;
      worktreePath?: string;
      agentType?: string;
      model?: string;
    };
    const { featureId, worktreePath, agentType, model } = body;

    if (!featureId || typeof featureId !== 'string') {
      return NextResponse.json({ error: 'featureId is required' }, { status: 400 });
    }
    if (!worktreePath || typeof worktreePath !== 'string') {
      return NextResponse.json({ error: 'worktreePath is required' }, { status: 400 });
    }

    const useCase = resolve<StartInteractiveSessionUseCase>('StartInteractiveSessionUseCase');
    const session = await useCase.execute({ featureId, worktreePath, agentType, model });

    return NextResponse.json({ sessionId: session.id, status: session.status }, { status: 201 });
  } catch (error) {
    // Match on `code`: `instanceof` never matches across the route bundle
    // (see lib/error-code.ts).
    if (errorCode(error) === CONCURRENT_SESSION_LIMIT_CODE) {
      return NextResponse.json(
        { error: (error as Error).message, code: CONCURRENT_SESSION_LIMIT_CODE },
        { status: 429 }
      );
    }
    // eslint-disable-next-line no-console
    console.error('[POST /api/interactive/sessions]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
