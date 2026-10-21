/**
 * Resume an interrupted application workflow.
 *
 * POST /api/applications/:id/resume
 *
 * Runs `ResumeApplicationWorkflowUseCase` in the background: re-runs the
 * interrupted or failed steps from where they left off, or restarts setup
 * (keeping existing files) when it failed before any step existed. The
 * agent SDK session is resumed with the same conversation context.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { ResumeApplicationWorkflowUseCase } from '@shepai/core/application/use-cases/applications/resume-application-workflow.use-case';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const useCase = resolve<ResumeApplicationWorkflowUseCase>('ResumeApplicationWorkflowUseCase');
    // Fire-and-forget: the workflow outlives the request. Log a rejection
    // (e.g. an unknown id) instead of leaving it unhandled.
    useCase.execute({ applicationId: id }).catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error('[POST /api/applications/:id/resume] resume failed', error);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/applications/:id/resume]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
