/**
 * POST /api/workflow-steps/[stepId]/force-stop
 *
 * Manually flip a stuck pending/running workflow step to
 * `interrupted`. Used when a daemon restart or missed SSE update
 * left the step tracker showing in-progress even though nothing is
 * actually running — the user can force-stop the step and then use
 * the existing "Continue" retry flow if they want to resume.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { ForceStopWorkflowStepUseCase } from '@shepai/core/application/use-cases/workflows/force-stop-workflow-step.use-case';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ stepId: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { stepId } = await params;
    const useCase = resolve<ForceStopWorkflowStepUseCase>('ForceStopWorkflowStepUseCase');
    const result = await useCase.execute({ stepId });
    if (!result.stopped) {
      return NextResponse.json(result, { status: 409 });
    }
    return NextResponse.json(result);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/workflow-steps/:stepId/force-stop]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
