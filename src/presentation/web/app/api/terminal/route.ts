/**
 * POST /api/terminal
 *
 * Creates a new interactive PTY session rooted at the given working
 * directory. Returns `{ sessionId, shell, cwd }`. The client then opens
 * an SSE stream at `/api/terminal/[id]/stream` and posts input to
 * `/api/terminal/[id]/input`.
 */

import type { NextRequest } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { CreateTerminalSessionUseCase } from '@shepai/core/application/use-cases/terminal/create-terminal-session.use-case';

export const dynamic = 'force-dynamic';

interface CreateBody {
  cwd?: string;
  cols?: number;
  rows?: number;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as CreateBody;
    if (!body.cwd || typeof body.cwd !== 'string') {
      return Response.json({ error: 'cwd is required' }, { status: 400 });
    }

    const useCase = resolve<CreateTerminalSessionUseCase>('CreateTerminalSessionUseCase');
    const session = useCase.execute({
      cwd: body.cwd,
      cols: typeof body.cols === 'number' ? body.cols : undefined,
      rows: typeof body.rows === 'number' ? body.rows : undefined,
    });

    return Response.json({
      sessionId: session.id,
      shell: session.shell,
      cwd: session.cwd,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[POST /api/terminal]', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
