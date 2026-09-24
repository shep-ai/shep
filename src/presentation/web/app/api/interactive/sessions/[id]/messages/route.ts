/**
 * /api/interactive/sessions/[id]/messages
 *
 * POST - Send a user message to an active session. Returns 202.
 * GET  - List all messages for the session's feature (cross-session history).
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { IInteractiveSessionService } from '@shepai/core/application/ports/output/services/interactive-session-service.interface';

export const dynamic = 'force-dynamic';

/** Maximum allowed message size: 32 KB */
const MAX_CONTENT_BYTES = 32 * 1024;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id: sessionId } = await params;
    const body = (await request.json()) as { content?: string };
    const { content } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'content must be a non-empty string' }, { status: 400 });
    }

    if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) {
      return NextResponse.json({ error: 'content exceeds maximum size of 32 KB' }, { status: 400 });
    }

    const service = resolve<IInteractiveSessionService>('IInteractiveSessionService');

    // Verify session exists
    const session = await service.getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    await service.sendMessage(sessionId, content);
    return new NextResponse(null, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not ready')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    // eslint-disable-next-line no-console
    console.error('[POST /api/interactive/sessions/:id/messages]', error);
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
    const { id: sessionId } = await params;
    const service = resolve<IInteractiveSessionService>('IInteractiveSessionService');

    const session = await service.getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    await service.clearMessages(session.featureId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[DELETE /api/interactive/sessions/:id/messages]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id: sessionId } = await params;
    const url = new URL(request.url);
    const limit = url.searchParams.get('limit');
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    // `?limit=abc` parses to NaN, which the service forwards and the
    // repository binds into `LIMIT ?` — SQLite raises a datatype mismatch
    // instead of returning the default page. Treat it as "not requested".
    const limitNum =
      parsedLimit !== undefined && Number.isFinite(parsedLimit) ? parsedLimit : undefined;

    const service = resolve<IInteractiveSessionService>('IInteractiveSessionService');

    // Resolve session to get featureId for cross-session history
    const session = await service.getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const messages = await service.getMessages(session.featureId, limitNum);
    return NextResponse.json(messages);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /api/interactive/sessions/:id/messages]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
