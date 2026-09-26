// @vitest-environment node

/**
 * API Route Tests: GET /api/interactive/chat/:featureId/stream
 *
 * A session that fails to boot never produces a turn, so the reason carried
 * with its `error` status is the only explanation the chat can show. The SSE
 * `session_status` event must forward it.
 */

import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { StreamChunk } from '@shepai/core/application/ports/output/services/interactive-session-service.interface';

let emit: ((chunk: StreamChunk) => void) | undefined;

vi.mock('@/lib/server-container', () => ({
  resolve: vi.fn(() => ({
    subscribeByFeature: (_featureId: string, cb: (chunk: StreamChunk) => void) => {
      emit = cb;
      return () => undefined;
    },
  })),
}));

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, marker: string) {
  const decoder = new TextDecoder();
  let text = '';
  while (!text.includes(marker)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  return text;
}

describe('GET /api/interactive/chat/:featureId/stream', () => {
  it('forwards the session error reason with the error status', async () => {
    const { GET } = await import(
      '../../../../../src/presentation/web/app/api/interactive/chat/[featureId]/stream/route.js'
    );
    const controller = new AbortController();
    const res = await GET(
      new NextRequest('http://localhost/api/interactive/chat/app-1/stream', {
        signal: controller.signal,
      }),
      { params: Promise.resolve({ featureId: 'app-1' }) }
    );
    const reader = res.body!.getReader();
    await readUntil(reader, ': connected');

    emit!({
      delta: '',
      done: false,
      sessionStatus: 'error',
      sessionError: 'cursor-agent is not logged in',
    });
    const text = await readUntil(reader, 'event: session_status');

    const line = text.split('\n').find((l) => l.startsWith('data:') && l.includes('sessionStatus'));
    expect(JSON.parse(line!.slice('data: '.length))).toEqual({
      sessionStatus: 'error',
      sessionError: 'cursor-agent is not logged in',
      featureId: 'app-1',
    });

    controller.abort();
    await reader.cancel();
  });
});
