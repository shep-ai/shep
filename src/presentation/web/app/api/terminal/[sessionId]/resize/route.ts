/**
 * POST /api/terminal/[sessionId]/resize
 *
 * Resizes the pseudo-terminal for a session. Body: `{ cols, rows }`.
 */

import type { NextRequest } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { ITerminalSessionService } from '@shepai/core/application/ports/output/services/terminal-session-service.interface';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

interface ResizeBody {
  cols?: number;
  rows?: number;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { sessionId } = await params;
  try {
    const body = (await request.json().catch(() => ({}))) as ResizeBody;
    if (typeof body.cols !== 'number' || typeof body.rows !== 'number') {
      return Response.json({ error: 'cols and rows are required' }, { status: 400 });
    }

    const service = resolve<ITerminalSessionService>('ITerminalSessionService');
    if (!service.exists(sessionId)) {
      return Response.json({ error: 'session not found' }, { status: 404 });
    }

    service.resize(sessionId, body.cols, body.rows);
    return Response.json({ ok: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/terminal/:sessionId/resize]', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
