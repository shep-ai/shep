/**
 * Get a single application by ID.
 *
 * GET /api/applications/:id
 *
 * Returns the application entity, initial chat state, and deployment snapshot
 * in a single call — everything the application page needs to render.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { GetApplicationUseCase } from '@shepai/core/application/use-cases/applications/get-application.use-case';
import type { GetInteractiveChatStateUseCase } from '@shepai/core/application/use-cases/interactive/get-interactive-chat-state.use-case';
import type { ChatState } from '@shepai/core/application/ports/output/services/interactive-session-service.interface';
import type { IDeploymentService } from '@shepai/core/application/ports/output/services/deployment-service.interface';
import { featureIdForApplication } from '@shepai/core/domain/shared/feature-id';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const getApp = resolve<GetApplicationUseCase>('GetApplicationUseCase');
    const application = await getApp.execute(id);

    if (!application) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    let initialChatState: ChatState | undefined;
    try {
      const getChatState = resolve<GetInteractiveChatStateUseCase>(
        'GetInteractiveChatStateUseCase'
      );
      initialChatState = await getChatState.execute({
        featureId: featureIdForApplication(application.id),
      });
    } catch {
      initialChatState = undefined;
    }

    let deployment: { state: string; url: string | null } | undefined;
    try {
      const deploymentService = resolve<IDeploymentService>('IDeploymentService');
      const status = deploymentService.getStatus(application.id);
      if (status && status.state !== 'Stopped') {
        deployment = { state: status.state, url: status.url };
      }
    } catch {
      deployment = undefined;
    }

    return NextResponse.json({ application, initialChatState, deployment });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /api/applications/:id]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
