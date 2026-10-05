/**
 * Control-center request guard policy.
 *
 * Pure decision logic for `middleware.ts`, kept free of Next.js types so the
 * exploit cases can be reproduced directly in unit tests.
 *
 * Threat model: the daemon listens on loopback, which is NOT a trust
 * boundary. Any page the operator visits can issue requests to the port, and
 * a `GET` with a side effect needs no CSRF token, no preflight and no
 * readable response — the request itself is the exploit. `Request.json()`
 * ignores Content-Type, so a foreign page can deliver a JSON body as a CORS
 * simple request with no preflight; a Content-Type check is therefore NOT
 * sufficient CSRF protection.
 *
 * The policy is four independent gates:
 *
 *  1. Per-install bearer token (cookie, `Authorization: Bearer`, or the
 *     `x-shep-token` header), compared in constant time.
 *  2. Host header validation — stops DNS rebinding.
 *  3. Origin/Referer validation on every state-changing request.
 *  4. Fetch metadata (`Sec-Fetch-Site`) — stops same-site-different-port
 *     pages, which a SameSite cookie alone does not cover.
 */

/** Name of the httpOnly, SameSite=Strict session cookie. */
export const SESSION_COOKIE_NAME = 'shep_session';

/** Header a non-browser client may use instead of `Authorization: Bearer`. */
export const TOKEN_HEADER_NAME = 'x-shep-token';

/** Query parameter accepted on page requests to bootstrap a session. */
export const TOKEN_QUERY_PARAM = 'token';

/** Prefix of the `Authorization` header value this guard understands. */
export const BEARER_PREFIX = 'Bearer ';

/** Every request below this prefix is part of the JSON/SSE API surface. */
export const API_PATH_PREFIX = '/api/';

/**
 * Routes that authenticate their callers themselves and are reached from
 * outside the machine (through the Cloudflare tunnel), so neither the session
 * token nor the loopback Host check can apply to them:
 *
 *  - GitHub verifies `x-hub-signature-256` (HMAC-SHA256 over the raw body).
 *  - WhatsApp Cloud API verifies `x-hub-signature-256` against the app secret,
 *    and its GET is Meta's verify-token handshake.
 *  - Feedback (spec 127) and alerts (spec 129) verify a per-space intake key
 *    (a bearer token compared by its SHA-256 hash).
 */
export const EXTERNALLY_AUTHENTICATED_PATHS = [
  '/api/webhooks/github',
  '/api/whatsapp/webhook',
  '/api/feedback',
  '/api/alerts',
] as const;

/** Methods that must not change state, and so need no CSRF protection. */
export const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'] as const;

/** Hostnames that resolve to this machine's loopback interface. */
export const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1', '::1'] as const;

/** `Sec-Fetch-Site` values that mean "not a cross-document request". */
export const SAME_ORIGIN_FETCH_SITES = ['same-origin', 'none'] as const;

/** Default port assumed when a Host header carries no explicit port. */
export const DEFAULT_HTTP_PORT = 80;

/** Environment variable holding extra Host values (reverse-proxy setups). */
export const ALLOWED_HOSTS_ENV = 'SHEP_ALLOWED_HOSTS';

/** Environment variable holding the port the daemon actually listens on. */
export const WEB_PORT_ENV = 'SHEP_WEB_PORT';

/** Environment variable that additionally gates HTML page requests. */
export const REQUIRE_TOKEN_FOR_PAGES_ENV = 'SHEP_WEB_REQUIRE_TOKEN';

/** Value that turns an opt-in environment flag on. */
export const ENV_FLAG_ON = '1';

export const HTTP_UNAUTHORIZED = 401;
export const HTTP_FORBIDDEN = 403;

/** Machine-readable denial reasons, surfaced in the response body. */
export const DENY_REASON = {
  HostNotAllowed: 'host_not_allowed',
  MissingCredential: 'missing_or_invalid_token',
  CrossSiteRequest: 'cross_site_request',
  OriginNotAllowed: 'origin_not_allowed',
} as const;

export type DenyReason = (typeof DENY_REASON)[keyof typeof DENY_REASON];

/** The parts of an incoming request the policy looks at. */
export interface GuardRequest {
  method: string;
  pathname: string;
  host: string | null;
  origin: string | null;
  referer: string | null;
  secFetchSite: string | null;
  authorization: string | null;
  headerToken: string | null;
  cookieToken: string | null;
  queryToken: string | null;
}

/** Everything the policy needs to know about this installation. */
export interface GuardPolicy {
  /** The per-install token from SHEP_HOME. */
  token: string;
  /** Port the daemon listens on, or null when it could not be determined. */
  port: number | null;
  /** Extra Host values an operator allowed (e.g. a reverse proxy). */
  extraHosts: string[];
  /** When true, HTML pages also require the token (no cookie bootstrap). */
  requireTokenForPages: boolean;
}

export type GuardDecision =
  | { kind: 'allow'; setSessionCookie: boolean }
  | { kind: 'deny'; status: number; reason: DenyReason };

/** Constant-time string compare; see `web-auth-token.service.ts`. */
type TokenComparator = (expected: string, candidate: string | null | undefined) => boolean;

/**
 * Parse `SHEP_ALLOWED_HOSTS` into a normalised list.
 */
export function parseAllowedHostsEnv(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * Only these exact endpoints verify their own callers. Never exempt children:
 * a raw prefix can contain dot segments or encoded separators that routing
 * later resolves to an unrelated API. A trailing slash is the only alias.
 */
export function isExternallyAuthenticatedPath(pathname: string): boolean {
  return EXTERNALLY_AUTHENTICATED_PATHS.some(
    (allowed) => pathname === allowed || pathname === `${allowed}/`
  );
}

function isSafeMethod(method: string): boolean {
  return (SAFE_METHODS as readonly string[]).includes(method.toUpperCase());
}

/** Split `host:port` / `[::1]:port` into its parts, lowercased. */
function splitHost(host: string): { hostname: string; port: number } {
  const normalised = host.trim().toLowerCase();

  if (normalised.startsWith('[')) {
    const close = normalised.indexOf(']');
    if (close > 0) {
      const hostname = normalised.slice(1, close);
      const rest = normalised.slice(close + 1);
      const port = rest.startsWith(':') ? Number(rest.slice(1)) : DEFAULT_HTTP_PORT;
      return { hostname, port };
    }
  }

  const colon = normalised.lastIndexOf(':');
  if (colon === -1) {
    return { hostname: normalised, port: DEFAULT_HTTP_PORT };
  }
  return { hostname: normalised.slice(0, colon), port: Number(normalised.slice(colon + 1)) };
}

/**
 * Accept only the loopback interface at the port this daemon serves, plus any
 * Host an operator explicitly allowed. Rejecting everything else is what
 * makes DNS rebinding useless: the attacker's name never appears here.
 */
export function isAllowedHost(host: string | null, policy: GuardPolicy): boolean {
  if (!host) return false;

  const normalised = host.trim().toLowerCase();
  if (policy.extraHosts.includes(normalised)) return true;

  const { hostname, port } = splitHost(normalised);
  if (policy.extraHosts.includes(hostname)) return true;
  if (!(LOOPBACK_HOSTNAMES as readonly string[]).includes(hostname)) return false;
  if (policy.port !== null && port !== policy.port) return false;

  return true;
}

/** Build the set of origins the browser is allowed to speak from. */
export function allowedOrigins(policy: GuardPolicy): string[] {
  const origins: string[] = [];

  for (const hostname of LOOPBACK_HOSTNAMES) {
    const authority = hostname === '::1' ? '[::1]' : hostname;
    const suffix = policy.port === null ? '' : `:${policy.port}`;
    origins.push(`http://${authority}${suffix}`);
  }

  for (const extra of policy.extraHosts) {
    origins.push(`http://${extra}`, `https://${extra}`);
  }

  return origins;
}

export function isAllowedOrigin(origin: string | null, policy: GuardPolicy): boolean {
  if (!origin) return false;
  const normalised = origin.trim().toLowerCase();
  if (normalised === 'null') return false;
  return allowedOrigins(policy).includes(normalised);
}

/** Derive an origin from a Referer for browsers that omit Origin. */
function originFromReferer(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function presentedToken(request: GuardRequest): string | null {
  const authorization = request.authorization?.trim() ?? '';
  if (authorization.toLowerCase().startsWith(BEARER_PREFIX.toLowerCase())) {
    const value = authorization.slice(BEARER_PREFIX.length).trim();
    if (value.length > 0) return value;
  }

  if (request.headerToken) return request.headerToken;
  if (request.cookieToken) return request.cookieToken;
  if (request.queryToken) return request.queryToken;

  return null;
}

/** True when the credential arrived in a header a foreign page cannot set. */
function usesHeaderCredential(request: GuardRequest, policy: GuardPolicy, eq: TokenComparator) {
  const authorization = request.authorization?.trim() ?? '';
  if (authorization.toLowerCase().startsWith(BEARER_PREFIX.toLowerCase())) {
    return eq(policy.token, authorization.slice(BEARER_PREFIX.length).trim());
  }
  return eq(policy.token, request.headerToken);
}

/**
 * Decide whether a request may proceed.
 *
 * `compareTokens` is injected so the pure policy stays independent of Node's
 * crypto module; `middleware.ts` passes the constant-time comparator.
 */
export function evaluateRequest(
  request: GuardRequest,
  policy: GuardPolicy,
  compareTokens: TokenComparator = defaultCompareTokens
): GuardDecision {
  // 1. Routes with their own authentication arrive from the public internet
  //    through the tunnel, so they precede the loopback Host check.
  if (isExternallyAuthenticatedPath(request.pathname)) {
    return { kind: 'allow', setSessionCookie: false };
  }

  // 2. Host validation — DNS rebinding defence, applied to every request.
  if (!isAllowedHost(request.host, policy)) {
    return { kind: 'deny', status: HTTP_FORBIDDEN, reason: DENY_REASON.HostNotAllowed };
  }

  const authenticated = compareTokens(policy.token, presentedToken(request));
  const isApi = request.pathname.startsWith(API_PATH_PREFIX);

  // 3. HTML pages. The daemon serves the UI, so a page response is where the
  //    browser is handed its session cookie — gating that bootstrap would
  //    leave no way to ever obtain one. Operators who want pages gated too
  //    set SHEP_WEB_REQUIRE_TOKEN=1 and open the tokenised URL.
  if (!isApi) {
    if (policy.requireTokenForPages && !authenticated) {
      return { kind: 'deny', status: HTTP_UNAUTHORIZED, reason: DENY_REASON.MissingCredential };
    }

    // A Server Action is a POST to a *page* path, not to /api/*, so the CSRF
    // check has to cover page routes as well. Next.js performs its own
    // Origin/Host comparison for Server Actions; this is the same rule
    // applied one layer earlier and to every state-changing page request.
    if (!isSafeMethod(request.method)) {
      const pageOrigin = request.origin ?? originFromReferer(request.referer);
      if (!isAllowedOrigin(pageOrigin, policy)) {
        return { kind: 'deny', status: HTTP_FORBIDDEN, reason: DENY_REASON.OriginNotAllowed };
      }
    }

    return {
      kind: 'allow',
      setSessionCookie: !compareTokens(policy.token, request.cookieToken),
    };
  }

  // 4. API surface — the token is mandatory.
  if (!authenticated) {
    return { kind: 'deny', status: HTTP_UNAUTHORIZED, reason: DENY_REASON.MissingCredential };
  }

  // 5. Fetch metadata. A SameSite cookie is scoped to the registrable domain
  //    and ignores the port, so http://localhost:8080 is "same-site" and does
  //    receive the cookie. Only this check rejects it.
  if (
    request.secFetchSite &&
    !(SAME_ORIGIN_FETCH_SITES as readonly string[]).includes(request.secFetchSite.toLowerCase())
  ) {
    return { kind: 'deny', status: HTTP_FORBIDDEN, reason: DENY_REASON.CrossSiteRequest };
  }

  // 6. CSRF. Ambient credentials (the cookie) are attached by the browser, so
  //    a state-changing request must also prove which document issued it. A
  //    header credential cannot be set cross-origin without a preflight the
  //    daemon never answers, so header-authenticated clients are exempt.
  if (!isSafeMethod(request.method) && !usesHeaderCredential(request, policy, compareTokens)) {
    const origin = request.origin ?? originFromReferer(request.referer);
    if (!isAllowedOrigin(origin, policy)) {
      return { kind: 'deny', status: HTTP_FORBIDDEN, reason: DENY_REASON.OriginNotAllowed };
    }
  }

  return { kind: 'allow', setSessionCookie: false };
}

/**
 * Length-checked comparison used when no constant-time comparator is passed.
 * Production callers inject the `timingSafeEqual`-backed one.
 */
function defaultCompareTokens(expected: string, candidate: string | null | undefined): boolean {
  if (!expected || !candidate) return false;
  if (expected.length !== candidate.length) return false;

  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= expected.charCodeAt(i) ^ candidate.charCodeAt(i);
  }
  return difference === 0;
}
