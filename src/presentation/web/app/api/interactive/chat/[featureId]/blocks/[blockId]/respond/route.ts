/**
 * Answer a chat block (spec 137).
 *
 * POST { action, note?, worktreePath? } — the user approved a spec, requested
 * changes, implemented a plan or asked to refine it. The use case stores the
 * answer in the conversation and tells the agent.
 *
 * `featureId` is the polymorphic chat scope key (feature id, `repo-<id>`,
 * `app-<id>` or `global`).
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import { errorCode } from '@/lib/error-code';
import type { RespondToChatBlockUseCase } from '@shepai/core/application/use-cases/interactive/respond-to-chat-block.use-case';
import type { ChatBlockAction } from '@shepai/core/domain/generated/output';
import { getShepHomeDir } from '@shepai/core/infrastructure/services/filesystem/shep-directory.service';
import { INVALID_CHAT_BLOCK_CODE } from '@shepai/core/domain/errors/invalid-chat-block.error';
import { CHAT_BLOCK_NOT_FOUND_CODE } from '@shepai/core/domain/errors/chat-block-not-found.error';
import { CHAT_BLOCK_ALREADY_ANSWERED_CODE } from '@shepai/core/domain/errors/chat-block-already-answered.error';
import { INTERACTIVE_AGENT_UNSUPPORTED_CODE } from '@shepai/core/domain/errors/interactive-agent-unsupported.error';
import { CONCURRENT_SESSION_LIMIT_CODE } from '@shepai/core/domain/errors/concurrent-session-limit.error';

export const dynamic = 'force-dynamic';

const STATUS_BY_CODE: Record<string, number> = {
  [INVALID_CHAT_BLOCK_CODE]: 400,
  [CHAT_BLOCK_NOT_FOUND_CODE]: 404,
  [CHAT_BLOCK_ALREADY_ANSWERED_CODE]: 409,
  // The agent could not be told (the answer was not stored): same codes as /messages.
  [INTERACTIVE_AGENT_UNSUPPORTED_CODE]: 422,
  [CONCURRENT_SESSION_LIMIT_CODE]: 429,
};

interface RouteParams {
  params: Promise<{ featureId: string; blockId: string }>;
}

interface RespondBody {
  action?: unknown;
  note?: unknown;
  worktreePath?: unknown;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { featureId, blockId } = await params;
    const body = (await request.json()) as RespondBody;
    if (typeof body.action !== 'string' || !body.action) {
      return NextResponse.json({ error: 'action must be a non-empty string' }, { status: 400 });
    }
    const worktreePath =
      typeof body.worktreePath === 'string' && body.worktreePath
        ? body.worktreePath
        : getShepHomeDir();

    const { message } = await resolve<RespondToChatBlockUseCase>(
      'RespondToChatBlockUseCase'
    ).execute({
      scope: featureId,
      blockId,
      // The domain validates the action against the block type.
      action: body.action as ChatBlockAction,
      ...(typeof body.note === 'string' ? { note: body.note } : {}),
      worktreePath,
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const code = errorCode(error);
    if (code && STATUS_BY_CODE[code]) {
      return NextResponse.json(
        { error: (error as Error).message, code },
        { status: STATUS_BY_CODE[code] }
      );
    }
    // eslint-disable-next-line no-console
    console.error('[POST /api/interactive/chat/:featureId/blocks/:blockId/respond]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
