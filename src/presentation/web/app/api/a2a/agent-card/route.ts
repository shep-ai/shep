/**
 * A2A agent card (spec 148).
 *
 * Served at /.well-known/agent-card.json through a rewrite in next.config.ts
 * (an app folder named `.well-known` is invisible to tooling). The request
 * guard sees the well-known page path, so the card is readable without the
 * token unless SHEP_WEB_REQUIRE_TOKEN is set; the endpoint it names is not.
 */

import { resolve } from '@/lib/server-container';

export const dynamic = 'force-dynamic';

interface A2aEndpoint {
  agentCard(request: Request): Response;
}

export function GET(request: Request): Response {
  return resolve<A2aEndpoint>('A2aHttpEndpoint').agentCard(request);
}
