import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';

import { CloudflarePagesProvider } from '@/infrastructure/services/cloud-deploy/cloudflare-pages.provider.js';
import {
  CloudflareApiError,
  CloudflareTokenInvalidError,
} from '@/infrastructure/services/cloud-deploy/cloud-deployment-errors.js';
import type { CloudDeployInput } from '@/application/ports/output/services/cloud-deployment-provider.interface.js';
import { CloudProviderNotConnectedError } from '@/domain/errors/cloud-provider-not-connected.error.js';
import { CloudDeploymentProvider, CloudDeploymentStatus } from '@/domain/generated/output.js';
import type { ICloudProviderTokensRepository } from '@/application/ports/output/repositories/cloud-provider-tokens.repository.interface.js';

class FakeTokensRepo implements ICloudProviderTokensRepository {
  constructor(private store: Map<string, string> = new Map()) {}
  async get(provider: CloudDeploymentProvider) {
    return this.store.get(provider) ?? null;
  }
  async set(provider: CloudDeploymentProvider, token: string) {
    this.store.set(provider, token);
  }
  async remove(provider: CloudDeploymentProvider) {
    this.store.delete(provider);
  }
  async listConnected() {
    return [...this.store.keys()] as CloudDeploymentProvider[];
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function htmlResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function envelopeOk<T>(result: T) {
  return { success: true, result, errors: [], messages: [] };
}

function envelopeFail(errors: { code: number; message: string }[]) {
  return { success: false, result: null, errors, messages: [] };
}

const FIXED_CLOCK = {
  now: () => 0,
  sleep: async (_ms: number) => {
    /* no-op for fast tests */
  },
};

function makeProvider(opts: {
  token?: string;
  fetchQueue: (() => Response)[];
  exec?: (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
}): CloudflarePagesProvider {
  const tokens = new FakeTokensRepo(
    opts.token ? new Map([[CloudDeploymentProvider.CloudflarePages, opts.token]]) : new Map()
  );
  let callIndex = 0;
  const fetchFn = vi.fn(async () => {
    const next = opts.fetchQueue[callIndex++];
    if (!next)
      throw new Error(`fetch called ${callIndex} times, only queued ${opts.fetchQueue.length}`);
    return next();
  });
  const execFile = vi.fn(opts.exec ?? (async () => ({ stdout: '', stderr: '' })));
  return new CloudflarePagesProvider(tokens, fetchFn, execFile, FIXED_CLOCK);
}

describe('CloudflarePagesProvider.isConnected', () => {
  it('returns false when no token stored', async () => {
    const p = makeProvider({ fetchQueue: [] });
    expect(await p.isConnected()).toBe(false);
  });

  it('returns true when token verify succeeds', async () => {
    const p = makeProvider({
      token: 'tok',
      fetchQueue: [() => jsonResponse(envelopeOk({ status: 'active' }))],
    });
    expect(await p.isConnected()).toBe(true);
  });

  it('returns false when token is not active', async () => {
    const p = makeProvider({
      token: 'tok',
      fetchQueue: [() => jsonResponse(envelopeOk({ status: 'expired' }))],
    });
    expect(await p.isConnected()).toBe(false);
  });

  it('returns false when verify fetch fails', async () => {
    const p = makeProvider({
      token: 'tok',
      fetchQueue: [() => jsonResponse(envelopeFail([{ code: 10000, message: 'invalid' }]), 401)],
    });
    expect(await p.isConnected()).toBe(false);
  });
});

describe('CloudflarePagesProvider.validateToken', () => {
  it('resolves on active token + at least one account', async () => {
    const p = makeProvider({
      fetchQueue: [
        () => jsonResponse(envelopeOk({ status: 'active' })),
        () => jsonResponse(envelopeOk([{ id: 'acct-1', name: 'A' }])),
      ],
    });
    await expect(p.validateToken('tok')).resolves.toBeUndefined();
  });

  it('throws CloudflareTokenInvalidError when status is not active', async () => {
    const p = makeProvider({
      fetchQueue: [() => jsonResponse(envelopeOk({ status: 'expired' }))],
    });
    await expect(p.validateToken('tok')).rejects.toBeInstanceOf(CloudflareTokenInvalidError);
  });

  it('throws CloudflareApiError when verify 401s', async () => {
    const p = makeProvider({
      fetchQueue: [() => jsonResponse(envelopeFail([{ code: 10000, message: 'invalid' }]), 401)],
    });
    await expect(p.validateToken('tok')).rejects.toBeInstanceOf(CloudflareApiError);
  });
});

describe('CloudflarePagesProvider.deploy', () => {
  const input: CloudDeployInput = {
    applicationId: 'app-1',
    projectName: 'my-slug',
    buildOutputDir: '/tmp/build',
  };

  it('throws CloudProviderNotConnectedError if no token is stored', async () => {
    const p = makeProvider({ fetchQueue: [] });
    const noop = (): void => undefined;
    await expect(p.deploy(input, noop)).rejects.toBeInstanceOf(CloudProviderNotConnectedError);
  });

  it('happy path: emits Uploading → Deploying → Deployed and returns the live URL', async () => {
    const execMock = vi.fn(async (_file: string, _args: string[]) => ({
      stdout:
        'Deployment complete! Take a peek over at https://my-slug.pages.dev\nDeployment ID: dep-123\n',
      stderr: '',
    }));

    let pollCount = 0;
    const p = makeProvider({
      token: 'tok',
      fetchQueue: [
        // discoverAccountId (for deploy)
        () => jsonResponse(envelopeOk([{ id: 'acct-1', name: 'A' }])),
        // ensureProject → listProjects (empty)
        () => jsonResponse(envelopeOk([])),
        // ensureProject → create
        () => jsonResponse(envelopeOk({ name: 'my-slug' })),
        // pollUntilFinished — first tick: deploying
        () =>
          jsonResponse(
            envelopeOk({
              id: 'dep-123',
              url: 'https://my-slug.pages.dev',
              latest_stage: { name: 'build', status: 'active' },
            })
          ),
        // second tick: success
        () =>
          jsonResponse(
            envelopeOk({
              id: 'dep-123',
              url: 'https://my-slug.pages.dev',
              latest_stage: { name: 'deploy', status: 'success' },
            })
          ),
      ],
      exec: async (file: string, args: string[]) => {
        pollCount++;
        return execMock(file, args);
      },
    });

    const progress: CloudDeploymentStatus[] = [];
    const result = await p.deploy(input, (s) => progress.push(s));
    expect(progress).toEqual([
      CloudDeploymentStatus.Uploading,
      CloudDeploymentStatus.Deploying,
      CloudDeploymentStatus.Deployed,
    ]);
    expect(result).toEqual({ deploymentId: 'dep-123', url: 'https://my-slug.pages.dev' });
    expect(pollCount).toBe(1); // wrangler was invoked exactly once
  });

  it('throws when the final stage reports failure', async () => {
    const p = makeProvider({
      token: 'tok',
      fetchQueue: [
        () => jsonResponse(envelopeOk([{ id: 'acct-1', name: 'A' }])),
        () => jsonResponse(envelopeOk([{ name: 'my-slug' }])), // project exists already
        // poll — failed
        () =>
          jsonResponse(
            envelopeOk({
              id: 'dep-999',
              url: undefined,
              latest_stage: { name: 'build', status: 'failure' },
            })
          ),
      ],
      exec: async () => ({
        stdout: 'Deployment ID: dep-999\n',
        stderr: '',
      }),
    });

    const noop = (): void => undefined;
    await expect(p.deploy(input, noop)).rejects.toBeInstanceOf(CloudflareApiError);
  });

  it('handles modern wrangler 4.x URL-banner output without feeding it back into a GET deployments/<id> call', async () => {
    // Regression: wrangler 4.82 prints:
    //   ⛅️ wrangler 4.82.2 ──…
    //   ✨ Deployment complete! Take a peek over at https://56b738ae.landing-page-hero-features-pricing-85f4e3.pages.dev
    // — and NO "Deployment ID: …" line. The old parser returned the whole
    // stdout blob as the "deployment id", which got URL-encoded into a GET
    // `/deployments/<banner-text>` call, which Cloudflare's edge answered
    // with a 403 HTML challenge page → false-negative "Deploy failed" for a
    // deploy that had actually succeeded. Fix: detect the URL banner, skip
    // polling, and fetch the newest deployment id via a single extra call.
    const wranglerStdout =
      ' ⛅️ wrangler 4.82.2\n' +
      '───────────────────\n' +
      'Uploading... (5/5)\n' +
      '✨ Success! Uploaded 0 files (5 already uploaded) (0.16 sec)\n' +
      '\n' +
      '🌎 Deploying...\n' +
      '✨ Deployment complete! Take a peek over at ' +
      'https://56b738ae.landing-page-hero-features-pricing-85f4e3.pages.dev\n';

    const p = makeProvider({
      token: 'tok',
      fetchQueue: [
        // discoverAccountId
        () => jsonResponse(envelopeOk([{ id: 'acct-1', name: 'A' }])),
        // ensureProject → already exists
        () => jsonResponse(envelopeOk([{ name: 'landing-page-hero-features-pricing-85f4e3' }])),
        // fetchNewestDeployment — returns the real deployment id we want
        // persisted on the Application row.
        () =>
          jsonResponse(
            envelopeOk([
              {
                id: 'real-deployment-uuid-42',
                url: 'https://56b738ae.landing-page-hero-features-pricing-85f4e3.pages.dev',
                latest_stage: { name: 'deploy', status: 'success' },
              },
            ])
          ),
      ],
      exec: async () => ({ stdout: wranglerStdout, stderr: '' }),
    });

    const progress: CloudDeploymentStatus[] = [];
    const result = await p.deploy(
      {
        applicationId: 'app-1',
        projectName: 'landing-page-hero-features-pricing-85f4e3',
        buildOutputDir: '/tmp/build',
      },
      (s) => progress.push(s)
    );

    expect(progress).toEqual([
      CloudDeploymentStatus.Uploading,
      CloudDeploymentStatus.Deploying,
      CloudDeploymentStatus.Deployed,
    ]);
    expect(result.url).toBe('https://56b738ae.landing-page-hero-features-pricing-85f4e3.pages.dev');
    // The real Cloudflare deployment id must be carried through — NOT the
    // wrangler stdout blob (which is what the old parser returned).
    expect(result.deploymentId).toBe('real-deployment-uuid-42');
    // And crucially the deployment id must not contain any characters from
    // the wrangler banner — those were the symptom of the old bug.
    expect(result.deploymentId).not.toMatch(/wrangler|Deployment complete|⛅/);
  });

  it('throws CloudflareApiError with HTTP status + body snippet when the edge returns an HTML page', async () => {
    // Regression: when Cloudflare's edge returns an HTML error page (5xx,
    // captive portal, rate-limit splash) the provider used to call res.json()
    // unconditionally and crash with `SyntaxError: Unexpected token '<', "<!DOCTYPE..."`.
    // That stack trace got persisted on the Application row, leaving the user
    // with no actionable info. The fix reads the body as text and throws a
    // structured CloudflareApiError so the failure mode is debuggable.
    const html =
      '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head>' +
      '<body><h1>Web server is down</h1><p>Error code 521</p></body></html>';
    const p = makeProvider({
      token: 'tok',
      fetchQueue: [() => htmlResponse(html, 502)],
    });
    const noop = (): void => undefined;
    let caught: unknown;
    try {
      await p.deploy(input, noop);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CloudflareApiError);
    const apiErr = caught as CloudflareApiError;
    expect(apiErr.status).toBe(502);
    expect(apiErr.message).toContain('non-JSON');
    expect(apiErr.message).toContain('502');
    expect(apiErr.message).toContain('502 Bad Gateway');
    // And it must NOT be the bare JSON parse error string.
    expect(apiErr.message).not.toMatch(/Unexpected token/);
  });

  it('never leaks the token into error messages', async () => {
    const secret = 'super-secret-token-xyz';
    const p = makeProvider({
      token: secret,
      fetchQueue: [() => jsonResponse(envelopeFail([{ code: 1000, message: 'auth fail' }]), 403)],
    });
    try {
      const noop = (): void => undefined;
      await p.deploy(input, noop);
      throw new Error('should have thrown');
    } catch (err) {
      expect(String(err)).not.toContain(secret);
      if (err instanceof Error) {
        expect(err.message).not.toContain(secret);
      }
    }
  });
});
