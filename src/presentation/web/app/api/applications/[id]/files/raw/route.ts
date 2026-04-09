/**
 * GET /api/applications/[id]/files/raw?path=relative/asset.png
 *
 * Streams a file from an application's repository as raw bytes with a
 * best-effort content-type. Used by the IDE tab to preview images and
 * other binary assets without round-tripping them through JSON.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { resolve } from '@/lib/server-container';
import type { ReadApplicationFileRawUseCase } from '@shepai/core/application/use-cases/applications/read-application-file-raw.use-case';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function errorStatus(message: string): number {
  if (/not found/i.test(message)) return 404;
  if (/path is required/i.test(message)) return 400;
  if (/escapes/i.test(message)) return 400;
  if (/is a directory/i.test(message)) return 400;
  if (/size limit/i.test(message)) return 413;
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

    const useCase = resolve<ReadApplicationFileRawUseCase>('ReadApplicationFileRawUseCase');
    const result = await useCase.execute({ applicationId: id, path: pathParam });

    // Copy into a fresh ArrayBuffer so Next.js 16's BodyInit type constraint
    // (which requires `ArrayBuffer`, not the wider `ArrayBufferLike`) is
    // satisfied. The prior version passing a Node Buffer directly was being
    // served with an incorrect length, causing the image to render broken.
    const ab = new ArrayBuffer(result.buffer.byteLength);
    new Uint8Array(ab).set(result.buffer);
    return new NextResponse(ab, {
      status: 200,
      headers: {
        'Content-Type': result.mimeType,
        'Content-Length': String(result.size),
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[GET /api/applications/:id/files/raw]', error);
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: errorStatus(message) });
  }
}
