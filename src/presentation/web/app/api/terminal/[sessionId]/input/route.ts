/**
 * POST /api/terminal/[sessionId]/input
 *
 * Writes raw keystroke data to a terminal session's stdin.
 */

import type { NextRequest } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { ITerminalSessionService } from '@shepai/core/application/ports/output/services/terminal-session-service.interface';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

interface InputBody {
  data?: string;
}

export async function POST(request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { sessionId } = await params;
  try {
    const body = (await request.json().catch(() => ({}))) as InputBody;
    if (typeof body.data !== 'string') {
      return Response.json({ error: 'data is required' }, { status: 400 });
    }

    const service = resolve<ITerminalSessionService>('ITerminalSessionService');
    if (!service.exists(sessionId)) {
      return Response.json({ error: 'session not found' }, { status: 404 });
    }

    service.write(sessionId, body.data);
    return Response.json({ ok: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/terminal/:sessionId/input]', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
