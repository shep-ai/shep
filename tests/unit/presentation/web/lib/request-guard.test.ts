// @vitest-environment node

/**
 * Unit tests — control-center request guard policy
 *
 * These tests reproduce the drive-by exploits the security audit found
 * against the unauthenticated daemon on localhost:4050, then lock in the
 * policy that stops them:
 *
 *  - C1: `<img src="http://localhost:4050/api/tools/docker/install/stream">`
 *        on any page the operator visits ran `curl … | bash`.
 *  - C3: an unauthenticated PTY with the user's GitHub token in its env.
 *  - DNS rebinding: a hostname the attacker controls resolving to 127.0.0.1.
 *  - Cross-origin JSON POST delivered as a CORS "simple request" with no
 *    preflight (`Request.json()` ignores Content-Type).
 */

import { describe, it, expect } from 'vitest';
import {
  EXTERNALLY_AUTHENTICATED_PATHS,
  SESSION_COOKIE_NAME,
  TOKEN_HEADER_NAME,
  DENY_REASON,
  evaluateRequest,
  parseAllowedHostsEnv,
  type GuardPolicy,
  type GuardRequest,
} from '@/lib/request-guard';

const TOKEN = 'a'.repeat(64);
const PORT = 4050;

const POLICY: GuardPolicy = {
  token: TOKEN,
  port: PORT,
  extraHosts: [],
  requireTokenForPages: false,
};

function makeRequest(overrides: Partial<GuardRequest> = {}): GuardRequest {
  return {
    method: 'GET',
    pathname: '/api/tools',
    host: `localhost:${PORT}`,
    origin: null,
    referer: null,
    secFetchSite: null,
    authorization: null,
    headerToken: null,
    cookieToken: null,
    queryToken: null,
    ...overrides,
  };
}

/** A same-origin browser request from the real UI. */
function browserRequest(overrides: Partial<GuardRequest> = {}): GuardRequest {
  return makeRequest({
    origin: `http://localhost:${PORT}`,
    secFetchSite: 'same-origin',
    cookieToken: TOKEN,
    ...overrides,
  });
}

describe('request guard — C1: drive-by install from a foreign page', () => {
  it('denies the <img> GET that triggered `curl | bash` (no cookie, cross-site)', () => {
    // A no-cors <img> request carries no Origin and — with a SameSite=Strict
    // session cookie — no credentials either.
    const decision = evaluateRequest(
      makeRequest({
        pathname: '/api/tools/docker/install/stream',
        secFetchSite: 'cross-site',
      }),
      POLICY
    );

    expect(decision.kind).toBe('deny');
    expect(decision.kind === 'deny' && decision.status).toBe(401);
  });

  it('denies it even when the browser still attached the session cookie', () => {
    // SameSite=Strict is scoped to the registrable domain, so a page served
    // from http://localhost:8080 is "same-site" and DOES get the cookie.
    // The fetch-metadata check is what closes that hole.
    const decision = evaluateRequest(
      makeRequest({
        pathname: '/api/tools/docker/install/stream',
        secFetchSite: 'same-site',
        cookieToken: TOKEN,
      }),
      POLICY
    );

    expect(decision.kind).toBe('deny');
    expect(decision.kind === 'deny' && decision.status).toBe(403);
    expect(decision.kind === 'deny' && decision.reason).toBe(DENY_REASON.CrossSiteRequest);
  });
});

describe('request guard — C3: unauthenticated PTY and agent sessions', () => {
  it.each([
    '/api/terminal',
    '/api/terminal/abc/input',
    '/api/interactive/sessions',
    '/api/cli-upgrade',
  ])('denies an unauthenticated POST to %s', (pathname) => {
    const decision = evaluateRequest(makeRequest({ method: 'POST', pathname }), POLICY);

    expect(decision.kind).toBe('deny');
    expect(decision.kind === 'deny' && decision.status).toBe(401);
    expect(decision.kind === 'deny' && decision.reason).toBe(DENY_REASON.MissingCredential);
  });

  it('denies a cross-origin POST that rides the session cookie (CSRF)', () => {
    // `Request.json()` ignores Content-Type, so a foreign page can deliver a
    // JSON body as a CORS simple request with no preflight. A Content-Type
    // check alone would not catch this; the Origin check does.
    const decision = evaluateRequest(
      makeRequest({
        method: 'POST',
        pathname: '/api/terminal',
        origin: 'https://evil.example',
        cookieToken: TOKEN,
      }),
      POLICY
    );

    expect(decision.kind).toBe('deny');
    expect(decision.kind === 'deny' && decision.status).toBe(403);
    expect(decision.kind === 'deny' && decision.reason).toBe(DENY_REASON.OriginNotAllowed);
  });

  it('denies a cookie-authenticated POST with no Origin and no Referer', () => {
    const decision = evaluateRequest(
      makeRequest({ method: 'POST', pathname: '/api/terminal', cookieToken: TOKEN }),
      POLICY
    );

    expect(decision.kind).toBe('deny');
    expect(decision.kind === 'deny' && decision.reason).toBe(DENY_REASON.OriginNotAllowed);
  });

  it('allows the real UI POST (same-origin, cookie, matching Origin)', () => {
    const decision = evaluateRequest(
      browserRequest({ method: 'POST', pathname: '/api/terminal' }),
      POLICY
    );

    expect(decision.kind).toBe('allow');
  });

  it('accepts a Referer when the browser omits Origin', () => {
    const decision = evaluateRequest(
      makeRequest({
        method: 'POST',
        pathname: '/api/terminal',
        referer: `http://localhost:${PORT}/applications`,
        secFetchSite: 'same-origin',
        cookieToken: TOKEN,
      }),
      POLICY
    );

    expect(decision.kind).toBe('allow');
  });
});

describe('request guard — DNS rebinding (Host header validation)', () => {
  it('denies a Host the daemon does not serve', () => {
    const decision = evaluateRequest(
      browserRequest({ host: 'rebind.attacker.example', origin: 'http://rebind.attacker.example' }),
      POLICY
    );

    expect(decision.kind).toBe('deny');
    expect(decision.kind === 'deny' && decision.status).toBe(403);
    expect(decision.kind === 'deny' && decision.reason).toBe(DENY_REASON.HostNotAllowed);
  });

  it('denies a loopback Host on the wrong port', () => {
    const decision = evaluateRequest(browserRequest({ host: 'localhost:9999' }), POLICY);

    expect(decision.kind).toBe('deny');
    expect(decision.kind === 'deny' && decision.reason).toBe(DENY_REASON.HostNotAllowed);
  });

  it('denies a missing Host header', () => {
    const decision = evaluateRequest(browserRequest({ host: null }), POLICY);

    expect(decision.kind).toBe('deny');
  });

  it.each([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`])(
    'allows the loopback Host %s',
    (host) => {
      expect(evaluateRequest(browserRequest({ host }), POLICY).kind).toBe('allow');
    }
  );

  it('allows an operator-configured extra host (reverse-proxy deployments)', () => {
    const policy: GuardPolicy = { ...POLICY, extraHosts: ['runner.shep.internal'] };
    const decision = evaluateRequest(
      browserRequest({ host: 'runner.shep.internal', origin: 'https://runner.shep.internal' }),
      policy
    );

    expect(decision.kind).toBe('allow');
  });

  it('accepts any port when the daemon port is unknown', () => {
    const policy: GuardPolicy = { ...POLICY, port: null };
    expect(evaluateRequest(browserRequest({ host: 'localhost:31337' }), policy).kind).toBe('allow');
  });
});

describe('request guard — credentials', () => {
  it('accepts a bearer token and skips the Origin requirement for it', () => {
    // A cross-origin page cannot set an Authorization header without a
    // preflight, and the daemon sends no CORS headers, so header auth is
    // inherently CSRF-proof. CLI/curl clients rely on this.
    const decision = evaluateRequest(
      makeRequest({
        method: 'POST',
        pathname: '/api/terminal',
        authorization: `Bearer ${TOKEN}`,
      }),
      POLICY
    );

    expect(decision.kind).toBe('allow');
  });

  it(`accepts the ${TOKEN_HEADER_NAME} header`, () => {
    const decision = evaluateRequest(
      makeRequest({ method: 'POST', pathname: '/api/terminal', headerToken: TOKEN }),
      POLICY
    );

    expect(decision.kind).toBe('allow');
  });

  it('rejects a wrong token', () => {
    const decision = evaluateRequest(
      makeRequest({ authorization: `Bearer ${'b'.repeat(64)}` }),
      POLICY
    );

    expect(decision.kind).toBe('deny');
    expect(decision.kind === 'deny' && decision.status).toBe(401);
  });

  it('rejects an empty credential', () => {
    expect(evaluateRequest(makeRequest({ cookieToken: '' }), POLICY).kind).toBe('deny');
    expect(evaluateRequest(makeRequest({ authorization: 'Bearer ' }), POLICY).kind).toBe('deny');
  });

  it(`names the cookie ${SESSION_COOKIE_NAME}`, () => {
    expect(SESSION_COOKIE_NAME).toBe('shep_session');
  });
});

describe('request guard — page requests', () => {
  it('lets an unauthenticated page load through and hands it a session cookie', () => {
    const decision = evaluateRequest(makeRequest({ pathname: '/settings' }), POLICY);

    expect(decision.kind).toBe('allow');
    expect(decision.kind === 'allow' && decision.setSessionCookie).toBe(true);
  });

  it('still enforces the Host check on page requests', () => {
    const decision = evaluateRequest(
      makeRequest({ pathname: '/settings', host: 'rebind.attacker.example' }),
      POLICY
    );

    expect(decision.kind).toBe('deny');
  });

  it('gates pages too when strict mode is enabled', () => {
    const policy: GuardPolicy = { ...POLICY, requireTokenForPages: true };

    expect(evaluateRequest(makeRequest({ pathname: '/settings' }), policy).kind).toBe('deny');
    expect(
      evaluateRequest(makeRequest({ pathname: '/settings', queryToken: TOKEN }), policy).kind
    ).toBe('allow');
  });

  it('refuses a cross-origin Server Action POST to a page path', () => {
    // Server Actions POST to the page URL, not to /api/*, so the CSRF rule
    // has to cover page routes too.
    const decision = evaluateRequest(
      makeRequest({ method: 'POST', pathname: '/settings', origin: 'https://evil.example' }),
      POLICY
    );

    expect(decision.kind).toBe('deny');
    expect(decision.kind === 'deny' && decision.reason).toBe(DENY_REASON.OriginNotAllowed);
  });

  it('allows a same-origin Server Action POST', () => {
    const decision = evaluateRequest(
      makeRequest({
        method: 'POST',
        pathname: '/settings',
        origin: `http://localhost:${PORT}`,
        secFetchSite: 'same-origin',
      }),
      POLICY
    );

    expect(decision.kind).toBe('allow');
  });

  it('does not re-issue the cookie when the browser already holds the right one', () => {
    const decision = evaluateRequest(
      makeRequest({ pathname: '/settings', cookieToken: TOKEN }),
      POLICY
    );

    expect(decision.kind === 'allow' && decision.setSessionCookie).toBe(false);
  });
});

describe('request guard — externally authenticated webhooks', () => {
  it.each([
    '/api/webhooks/github/../../terminal',
    '/api/whatsapp/webhook/../../terminal',
    '/api/webhooks/github/%2e%2e/%2e%2e/terminal',
    '/api/whatsapp/webhook/%2e%2e%2f%2e%2e%2fterminal',
    '/api/webhooks/github/..\\..\\terminal',
    '/api/webhooks/github/other',
  ])('does not exempt a traversal or unauthenticated child route: %s', (pathname) => {
    expect(evaluateRequest(makeRequest({ pathname }), POLICY)).toMatchObject({
      kind: 'deny',
      reason: DENY_REASON.MissingCredential,
    });
    expect(
      evaluateRequest(makeRequest({ pathname, host: 'tunnel.trycloudflare.com' }), POLICY)
    ).toMatchObject({ kind: 'deny', reason: DENY_REASON.HostNotAllowed });
  });

  it.each(EXTERNALLY_AUTHENTICATED_PATHS)(
    'lets %s through unauthenticated (it verifies its own HMAC)',
    (pathname) => {
      // These arrive from GitHub / Meta through a Cloudflare tunnel, so the
      // Host is the tunnel hostname and there is no session cookie.
      const decision = evaluateRequest(
        makeRequest({ method: 'POST', pathname, host: 'tunnel.trycloudflare.com' }),
        POLICY
      );

      expect(decision.kind).toBe('allow');
      expect(decision.kind === 'allow' && decision.setSessionCookie).toBe(false);
    }
  );

  it('exempts the feedback endpoint, which verifies its own key (spec 127)', () => {
    expect(EXTERNALLY_AUTHENTICATED_PATHS).toContain('/api/feedback');
    const child = evaluateRequest(
      makeRequest({
        method: 'POST',
        pathname: '/api/feedback/x',
        host: 'tunnel.trycloudflare.com',
      }),
      POLICY
    );
    expect(child.kind).toBe('deny');
  });

  it('does not exempt a path that merely starts with a webhook path', () => {
    const decision = evaluateRequest(
      makeRequest({
        method: 'POST',
        pathname: `${EXTERNALLY_AUTHENTICATED_PATHS[0]}-evil`,
        host: 'tunnel.trycloudflare.com',
      }),
      POLICY
    );

    expect(decision.kind).toBe('deny');
  });
});

describe('parseAllowedHostsEnv', () => {
  it('splits, trims, lowercases and drops empties', () => {
    expect(parseAllowedHostsEnv(' A.example:8080 , ,b.example ')).toEqual([
      'a.example:8080',
      'b.example',
    ]);
  });

  it('returns an empty list for undefined', () => {
    expect(parseAllowedHostsEnv(undefined)).toEqual([]);
  });
});
