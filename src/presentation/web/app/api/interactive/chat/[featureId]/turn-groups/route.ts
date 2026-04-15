/**
 * GET /api/interactive/chat/[featureId]/turn-groups
 *
 * Returns server-derived user turn groups for a feature's chat history.
 *
 * Every COMPLETED user turn (a user message plus the assistant replies
 * that followed it) is collapsed into a named card so the thread
 * stays short. The MOST RECENT turn is left out so the user keeps
 * seeing their live reply stream in place.
 *
 * Thin route — delegates to `GetChatTurnGroupsUseCase` and serialises
 * the DTO. No grouping logic lives here; it all happens inside the
 * use case so the CLI / TUI could expose the same data tomorrow.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { GetChatTurnGroupsUseCase } from '@shepai/core/application/use-cases/interactive/get-chat-turn-groups.use-case';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ featureId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { featureId } = await params;
    if (!featureId || featureId.trim().length === 0) {
      return NextResponse.json({ error: 'Missing featureId' }, { status: 400 });
    }

    const useCase = resolve<GetChatTurnGroupsUseCase>('GetChatTurnGroupsUseCase');
    const result = await useCase.execute({ featureId });
    return NextResponse.json(result);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /api/interactive/chat/:featureId/turn-groups]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
