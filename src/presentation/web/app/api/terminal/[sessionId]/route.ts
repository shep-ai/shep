/**
 * DELETE /api/terminal/[sessionId]
 *
 * Kills and removes a terminal session. Idempotent.
 */

import type { NextRequest } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { ITerminalSessionService } from '@shepai/core/application/ports/output/services/terminal-session-service.interface';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<Response> {
  const { sessionId } = await params;
  try {
    const service = resolve<ITerminalSessionService>('ITerminalSessionService');
    service.close(sessionId);
    return Response.json({ ok: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[DELETE /api/terminal/:sessionId]', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
