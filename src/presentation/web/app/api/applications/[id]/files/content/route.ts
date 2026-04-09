/**
 * GET  /api/applications/[id]/files/content?path=relative/file
 * PUT  /api/applications/[id]/files/content  { path, content }
 *
 * Reads and writes a single text file inside an application's repository.
 */

import type { NextRequest } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { ReadApplicationFileUseCase } from '@shepai/core/application/use-cases/applications/read-application-file.use-case';
import type { WriteApplicationFileUseCase } from '@shepai/core/application/use-cases/applications/write-application-file.use-case';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function errorStatus(message: string): number {
  if (/not found/i.test(message)) return 404;
  if (/path is required/i.test(message)) return 400;
  if (/escapes/i.test(message)) return 400;
  if (/is a directory/i.test(message)) return 400;
  return 500;
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const pathParam = url.searchParams.get('path');
    if (!pathParam) {
      return Response.json({ error: 'path query parameter is required' }, { status: 400 });
    }

    const useCase = resolve<ReadApplicationFileUseCase>('ReadApplicationFileUseCase');
    const result = await useCase.execute({ applicationId: id, path: pathParam });
    return Response.json(result);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /api/applications/:id/files/content]', error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: errorStatus(message) });
  }
}

interface WriteBody {
  path?: string;
  content?: string;
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<Response> {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as WriteBody;
    if (!body.path || typeof body.path !== 'string') {
      return Response.json({ error: 'path is required' }, { status: 400 });
    }
    if (typeof body.content !== 'string') {
      return Response.json({ error: 'content must be a string' }, { status: 400 });
    }

    const useCase = resolve<WriteApplicationFileUseCase>('WriteApplicationFileUseCase');
    await useCase.execute({
      applicationId: id,
      path: body.path,
      content: body.content,
    });
    return Response.json({ ok: true });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[PUT /api/applications/:id/files/content]', error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: errorStatus(message) });
  }
}
