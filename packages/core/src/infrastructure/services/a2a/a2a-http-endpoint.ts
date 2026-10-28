/**
 * A2A HTTP endpoint (spec 149): standard fetch `Request` in, `Response` out,
 * so the Next.js routes stay one line and any HTTP server can host the same
 * endpoint. JSON-RPC answers are JSON; streaming methods answer with
 * `text/event-stream`, one JSON-RPC response per `data:` frame, and an SSE
 * comment every so often so idle proxies keep the connection.
 *
 * Authentication is not here: the web request guard demands the install's
 * bearer token on every /api request before this runs.
 */

import { inject, injectable } from 'tsyringe';
import type { IVersionService } from '../../../application/ports/output/services/version-service.interface.js';
import { buildAgentCard } from './a2a-agent-card.js';
import { A2aRequestHandler } from './a2a-request-handler.js';
import { A2A_VERSION_HEADER, sseFrame } from './a2a.types.js';

const KEEP_ALIVE_MS = 15_000;
const SSE_KEEP_ALIVE = ': keep-alive\n\n';
const JSON_HEADERS = { 'content-type': 'application/json' };
const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
};

@injectable()
export class A2aHttpEndpoint {
  constructor(
    @inject(A2aRequestHandler)
    private readonly handler: A2aRequestHandler,
    @inject('IVersionService')
    private readonly versions: IVersionService
  ) {}

  /** POST /api/a2a */
  async handle(request: Request): Promise<Response> {
    const version =
      request.headers.get(A2A_VERSION_HEADER) ??
      new URL(request.url).searchParams.get(A2A_VERSION_HEADER);
    const outcome = await this.handler.handle(await request.text(), {
      version,
      signal: request.signal,
    });
    if (outcome.kind === 'json') {
      return new Response(JSON.stringify(outcome.body), { headers: JSON_HEADERS });
    }
    return new Response(sseStream(outcome.events, request.signal), { headers: SSE_HEADERS });
  }

  /** GET /.well-known/agent-card.json */
  agentCard(request: Request): Response {
    const card = buildAgentCard({
      baseUrl: new URL(request.url).origin,
      version: this.versions.getVersion().version,
    });
    return new Response(JSON.stringify(card), { headers: JSON_HEADERS });
  }
}

function sseStream(
  events: AsyncIterable<Parameters<typeof sseFrame>[0]>,
  signal: AbortSignal
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let keepAlive: ReturnType<typeof setInterval> | undefined;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (text: string): void => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // The client went away.
        }
      };
      keepAlive = setInterval(() => write(SSE_KEEP_ALIVE), KEEP_ALIVE_MS);
      try {
        for await (const event of events) {
          if (signal.aborted) break;
          write(sseFrame(event));
        }
      } finally {
        clearInterval(keepAlive);
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      }
    },
    cancel() {
      clearInterval(keepAlive);
    },
  });
}
