/**
 * Feature-scoped chat messages API.
 *
 * POST - Send a user message. Backend handles session lifecycle.
 * GET  - Get chat state: messages + session status + streaming text.
 * DELETE - Clear chat message history for the feature.
 *
 * The frontend never manages sessions — it just sends messages for a feature.
 *
 * `featureId` is a polymorphic scope key: a feature UUID, "repo-<id>", or "global".
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { SendInteractiveMessageUseCase } from '@shepai/core/application/use-cases/interactive/send-interactive-message.use-case';
import type { GetInteractiveChatStateUseCase } from '@shepai/core/application/use-cases/interactive/get-interactive-chat-state.use-case';
import type { IInteractiveSessionService } from '@shepai/core/application/ports/output/services/interactive-session-service.interface';
import { getShepHomeDir } from '@shepai/core/infrastructure/services/filesystem/shep-directory.service';
import { CONCURRENT_SESSION_LIMIT_CODE } from '@shepai/core/domain/errors/concurrent-session-limit.error';
import { errorCode } from '@/lib/error-code';

export const dynamic = 'force-dynamic';

const MAX_CONTENT_BYTES = 32 * 1024;

interface RouteParams {
  params: Promise<{ featureId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { featureId } = await params;
    const body = (await request.json()) as {
      content?: string;
      worktreePath?: string;
      model?: string;
      agentType?: string;
    };
    const { content, worktreePath, model, agentType } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'content must be a non-empty string' }, { status: 400 });
    }

    if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) {
      return NextResponse.json({ error: 'content exceeds maximum size of 32 KB' }, { status: 400 });
    }

    // worktreePath is optional — defaults to SHEP_HOME for global/repo sessions
    let resolvedWorktreePath = worktreePath;
    if (!resolvedWorktreePath || typeof resolvedWorktreePath !== 'string') {
      resolvedWorktreePath = getShepHomeDir();
    }

    const useCase = resolve<SendInteractiveMessageUseCase>('SendInteractiveMessageUseCase');
    const message = await useCase.execute({
      featureId,
      content,
      worktreePath: resolvedWorktreePath,
      model: typeof model === 'string' ? model : undefined,
      agentType: typeof agentType === 'string' ? agentType : undefined,
    });

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    // Match on `code`, not the message or `instanceof` (see lib/error-code.ts).
    if (errorCode(error) === CONCURRENT_SESSION_LIMIT_CODE) {
      return NextResponse.json(
        { error: (error as Error).message, code: CONCURRENT_SESSION_LIMIT_CODE },
        { status: 429 }
      );
    }
    // eslint-disable-next-line no-console
    console.error('[POST /api/interactive/chat/:featureId/messages]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { featureId } = await params;
    // clearMessages is not yet exposed as a use case — use service directly
    const service = resolve<IInteractiveSessionService>('IInteractiveSessionService');
    await service.clearMessages(featureId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[DELETE /api/interactive/chat/:featureId/messages]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { featureId } = await params;
    const useCase = resolve<GetInteractiveChatStateUseCase>('GetInteractiveChatStateUseCase');
    const chatState = await useCase.execute({ featureId });

    return NextResponse.json(chatState);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /api/interactive/chat/:featureId/messages]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
