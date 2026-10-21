/**
 * WebSocket upgrade guard.
 *
 * Node emits `upgrade` instead of `request` for a WebSocket handshake, so an
 * upgrade never runs the request listener and never reaches the Next.js
 * middleware. This holds it to the same policy as a page request
 * (`request-guard.ts`) — Host, then token where the path or the operator
 * requires one — plus one rule a plain GET does not need: a foreign page
 * cannot read a cross-origin GET response, but it CAN talk over a WebSocket it
 * opened, so a handshake that carries an Origin must name an allowed one.
 */

import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import {
  DENY_REASON,
  HTTP_FORBIDDEN,
  SESSION_COOKIE_NAME,
  TOKEN_HEADER_NAME,
  TOKEN_QUERY_PARAM,
  evaluateRequest,
  isAllowedHost,
  isAllowedOrigin,
  type GuardDecision,
  type GuardPolicy,
  type GuardRequest,
} from './request-guard';

/** A WebSocket handshake is always a GET. */
const UPGRADE_METHOD = 'GET';

/** Base for resolving the request-target, which carries no scheme or host. */
const URL_PARSE_BASE = 'http://localhost';

function header(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function cookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() === name) return pair.slice(separator + 1).trim();
  }
  return null;
}

/** Translate a raw handshake into the shape the request guard evaluates. */
export function guardRequestFromUpgrade(
  req: Pick<IncomingMessage, 'url' | 'headers'>
): GuardRequest {
  const url = new URL(req.url ?? '/', URL_PARSE_BASE);
  return {
    method: UPGRADE_METHOD,
    pathname: url.pathname,
    host: header(req.headers, 'host'),
    origin: header(req.headers, 'origin'),
    referer: header(req.headers, 'referer'),
    secFetchSite: header(req.headers, 'sec-fetch-site'),
    authorization: header(req.headers, 'authorization'),
    headerToken: header(req.headers, TOKEN_HEADER_NAME),
    cookieToken: cookieValue(header(req.headers, 'cookie'), SESSION_COOKIE_NAME),
    queryToken: url.searchParams.get(TOKEN_QUERY_PARAM),
  };
}

/**
 * Decide whether a WebSocket handshake may proceed.
 *
 * Unlike `evaluateRequest`, no path is exempt from the Host check: the
 * externally authenticated webhook routes are plain HTTP POSTs.
 */
export function evaluateUpgradeRequest(
  request: GuardRequest,
  policy: GuardPolicy,
  compareTokens?: Parameters<typeof evaluateRequest>[2]
): GuardDecision {
  if (!isAllowedHost(request.host, policy)) {
    return { kind: 'deny', status: HTTP_FORBIDDEN, reason: DENY_REASON.HostNotAllowed };
  }

  if (request.origin !== null && !isAllowedOrigin(request.origin, policy)) {
    return { kind: 'deny', status: HTTP_FORBIDDEN, reason: DENY_REASON.OriginNotAllowed };
  }

  return evaluateRequest(request, policy, compareTokens);
}
