/**
 * A2A JSON-RPC endpoint (spec 149): POST /api/a2a
 *
 * Other agent systems hand shep a feature request and follow it as an A2A 1.0
 * task. The request guard has already demanded the bearer token; everything
 * else — parsing, the methods, JSON or SSE — is the core A2A endpoint's job.
 */

import { resolve } from '@/lib/server-container';

// Streams must never be statically optimized or cached.
export const dynamic = 'force-dynamic';

interface A2aEndpoint {
  handle(request: Request): Promise<Response>;
}

export function POST(request: Request): Promise<Response> {
  return resolve<A2aEndpoint>('A2aHttpEndpoint').handle(request);
}
