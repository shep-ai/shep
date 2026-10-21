/**
 * Control-center middleware — authentication, Host and CSRF gate.
 *
 * Runs in front of every page and every `/api/*` route. The decision logic
 * lives in `lib/request-guard.ts`; this file is the Next.js adapter:
 * it reads the per-install token, translates a `NextRequest` into the
 * policy's input shape, and turns the decision into a response.
 *
 * Runs on the Node.js runtime because the token is persisted in SHEP_HOME and
 * compared with `crypto.timingSafeEqual`.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeTokenEquals } from '@shepai/core/infrastructure/services/web-auth/web-auth-token.service';
import { readGuardPolicy } from '@shepai/core/infrastructure/services/web-auth/guard-policy';
import {
  ALLOWED_HOSTS_ENV,
  SESSION_COOKIE_NAME,
  TOKEN_HEADER_NAME,
  TOKEN_QUERY_PARAM,
  evaluateRequest,
  type GuardPolicy,
} from '@/lib/request-guard';

export const runtime = 'nodejs';

/**
 * Everything except Next's own immutable build output. Page requests are
 * matched too — that is where the browser is handed its session cookie.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};

/** Human-readable messages for each denial, for the JSON body. */
const DENY_MESSAGES: Record<string, string> = {
  host_not_allowed: `Host not allowed. The Shep control center only serves loopback requests; set ${ALLOWED_HOSTS_ENV} to serve it behind a proxy.`,
  missing_or_invalid_token: 'Missing or invalid Shep control-center token.',
  cross_site_request: 'Cross-site requests to the Shep control center are refused.',
  origin_not_allowed: 'Request origin is not allowed.',
};

/** Status returned when the gate itself cannot run. */
const HTTP_SERVICE_UNAVAILABLE = 503;

export function middleware(request: NextRequest): NextResponse {
  let policy: GuardPolicy;
  try {
    policy = readGuardPolicy();
  } catch (error) {
    // The token lives in SHEP_HOME; if it cannot be read or created, the gate
    // cannot run. Fail CLOSED and say why, rather than throwing an opaque 500
    // or — far worse — falling through to the unauthenticated routes.
    const reason = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Shep control-center authentication is unavailable: ${reason}` },
      { status: HTTP_SERVICE_UNAVAILABLE }
    );
  }

  const decision = evaluateRequest(
    {
      method: request.method,
      pathname: request.nextUrl.pathname,
      host: request.headers.get('host'),
      origin: request.headers.get('origin'),
      referer: request.headers.get('referer'),
      secFetchSite: request.headers.get('sec-fetch-site'),
      authorization: request.headers.get('authorization'),
      headerToken: request.headers.get(TOKEN_HEADER_NAME),
      cookieToken: request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null,
      queryToken: request.nextUrl.searchParams.get(TOKEN_QUERY_PARAM),
    },
    policy,
    timingSafeTokenEquals
  );

  if (decision.kind === 'deny') {
    // No CORS headers are ever emitted, so a foreign page cannot read this
    // response either — the status alone is the answer.
    return NextResponse.json(
      { error: DENY_MESSAGES[decision.reason] ?? 'Request refused.', reason: decision.reason },
      { status: decision.status }
    );
  }

  const response = NextResponse.next();

  if (decision.setSessionCookie) {
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: policy.token,
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
    });
  }

  return response;
}
