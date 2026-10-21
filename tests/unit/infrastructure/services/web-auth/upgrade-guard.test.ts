// @vitest-environment node

/**
 * Unit tests — WebSocket upgrade guard.
 *
 * A Node `upgrade` event never runs the request listener, so it never reaches
 * the Next.js middleware. These tests lock in that an upgrade is held to the
 * same Host/token rules as a page request, plus an Origin check: unlike a
 * cross-site GET, a WebSocket handshake hands its response to the foreign page.
 */

import { describe, it, expect } from 'vitest';
import {
  DENY_REASON,
  HTTP_FORBIDDEN,
  HTTP_UNAUTHORIZED,
  SESSION_COOKIE_NAME,
  type GuardPolicy,
} from '@/infrastructure/services/web-auth/request-guard.js';
import {
  evaluateUpgradeRequest,
  guardRequestFromUpgrade,
} from '@/infrastructure/services/web-auth/upgrade-guard.js';

const TOKEN = 'b'.repeat(64);
const PORT = 4050;
const HMR_PATH = '/_next/hmr';

function policy(overrides: Partial<GuardPolicy> = {}): GuardPolicy {
  return { token: TOKEN, port: PORT, extraHosts: [], requireTokenForPages: false, ...overrides };
}

function upgrade(url: string, headers: Record<string, string> = {}) {
  return guardRequestFromUpgrade({ url, headers: { host: `localhost:${PORT}`, ...headers } });
}

describe('guardRequestFromUpgrade', () => {
  it('reads the path, credentials and fetch metadata from the handshake', () => {
    const request = guardRequestFromUpgrade({
      url: `${HMR_PATH}?token=${TOKEN}`,
      headers: {
        host: `localhost:${PORT}`,
        origin: `http://localhost:${PORT}`,
        cookie: `other=1; ${SESSION_COOKIE_NAME}=${TOKEN}`,
        'sec-fetch-site': 'same-origin',
      },
    });

    expect(request).toMatchObject({
      method: 'GET',
      pathname: HMR_PATH,
      host: `localhost:${PORT}`,
      origin: `http://localhost:${PORT}`,
      secFetchSite: 'same-origin',
      cookieToken: TOKEN,
      queryToken: TOKEN,
      authorization: null,
    });
  });
});

describe('evaluateUpgradeRequest', () => {
  it('allows the HMR socket from the control center itself', () => {
    const decision = evaluateUpgradeRequest(
      upgrade(HMR_PATH, { origin: `http://localhost:${PORT}` }),
      policy()
    );

    expect(decision.kind).toBe('allow');
  });

  it('refuses a Host the daemon does not serve (DNS rebinding)', () => {
    const decision = evaluateUpgradeRequest(
      upgrade(HMR_PATH, {
        host: `attacker.example:${PORT}`,
        origin: `http://attacker.example:${PORT}`,
      }),
      policy()
    );

    expect(decision).toEqual({
      kind: 'deny',
      status: HTTP_FORBIDDEN,
      reason: DENY_REASON.HostNotAllowed,
    });
  });

  it('refuses a missing Host', () => {
    const request = guardRequestFromUpgrade({ url: HMR_PATH, headers: {} });

    expect(evaluateUpgradeRequest(request, policy())).toMatchObject({
      kind: 'deny',
      reason: DENY_REASON.HostNotAllowed,
    });
  });

  it.each([
    ['a foreign site', 'https://attacker.example'],
    ['another localhost port (same-site, different origin)', 'http://localhost:8080'],
    ['an opaque origin', 'null'],
  ])('refuses a handshake from %s', (_label, origin) => {
    const decision = evaluateUpgradeRequest(upgrade(HMR_PATH, { origin }), policy());

    expect(decision).toEqual({
      kind: 'deny',
      status: HTTP_FORBIDDEN,
      reason: DENY_REASON.OriginNotAllowed,
    });
  });

  it('does not exempt the externally authenticated webhook paths from the Host check', () => {
    const decision = evaluateUpgradeRequest(
      upgrade('/api/webhooks/github', { host: 'attacker.example' }),
      policy()
    );

    expect(decision).toMatchObject({ kind: 'deny', reason: DENY_REASON.HostNotAllowed });
  });

  it('requires the token on an API path', () => {
    expect(evaluateUpgradeRequest(upgrade('/api/agent-events'), policy())).toEqual({
      kind: 'deny',
      status: HTTP_UNAUTHORIZED,
      reason: DENY_REASON.MissingCredential,
    });
    expect(
      evaluateUpgradeRequest(
        upgrade('/api/agent-events', { authorization: `Bearer ${TOKEN}` }),
        policy()
      ).kind
    ).toBe('allow');
  });

  it('requires the session cookie when SHEP_WEB_REQUIRE_TOKEN gates pages', () => {
    const gated = policy({ requireTokenForPages: true });

    expect(evaluateUpgradeRequest(upgrade(HMR_PATH), gated)).toMatchObject({
      kind: 'deny',
      reason: DENY_REASON.MissingCredential,
    });
    expect(
      evaluateUpgradeRequest(
        upgrade(HMR_PATH, { cookie: `${SESSION_COOKIE_NAME}=${TOKEN}` }),
        gated
      ).kind
    ).toBe('allow');
  });

  it('allows a host and origin an operator listed in SHEP_ALLOWED_HOSTS', () => {
    const decision = evaluateUpgradeRequest(
      upgrade(HMR_PATH, { host: 'shep.internal', origin: 'https://shep.internal' }),
      policy({ extraHosts: ['shep.internal'] })
    );

    expect(decision.kind).toBe('allow');
  });
});
