import { describe, it, expect, vi } from 'vitest';
import { PostHogTelemetryTransport } from '@/infrastructure/services/telemetry/posthog-telemetry-transport.js';
import { resolvePostHogConfig } from '@/infrastructure/services/telemetry/telemetry-config.js';
import type { TelemetryEnvelope } from '@/application/ports/output/services/telemetry-transport.interface.js';

const ANONYMOUS: TelemetryEnvelope = {
  uuid: 'u-1',
  event: 'cli.command',
  distinctId: 'install-1',
  timestamp: new Date('2026-10-09T12:00:00Z'),
  properties: { command: 'feat new' },
};

const IDENTIFIED: TelemetryEnvelope = {
  ...ANONYMOUS,
  uuid: 'u-2',
  personProperties: { githubUsername: 'octo', githubOwners: ['acme'], contactConsent: true },
};

function okFetch() {
  return vi.fn(async () => new Response('{"status":1}', { status: 200 }));
}

describe('resolvePostHogConfig', () => {
  it('uses the EU host and no key by default', () => {
    expect(resolvePostHogConfig({}, '')).toEqual({
      apiKey: null,
      host: 'https://eu.i.posthog.com',
    });
  });

  it('takes the key from SHEP_POSTHOG_KEY, then the build-time constant', () => {
    expect(resolvePostHogConfig({ SHEP_POSTHOG_KEY: ' phc_env ' }, 'phc_built').apiKey).toBe(
      'phc_env'
    );
    expect(resolvePostHogConfig({}, 'phc_built').apiKey).toBe('phc_built');
  });

  it('lets SHEP_POSTHOG_HOST override the host without a trailing slash', () => {
    expect(resolvePostHogConfig({ SHEP_POSTHOG_HOST: 'https://ph.example/' }, '').host).toBe(
      'https://ph.example'
    );
  });
});

describe('PostHogTelemetryTransport', () => {
  it('is unconfigured without a key and never calls fetch', async () => {
    const fetchImpl = okFetch();
    const transport = new PostHogTelemetryTransport(
      { apiKey: null, host: 'https://eu.i.posthog.com' },
      fetchImpl
    );
    expect(transport.isConfigured()).toBe(false);
    await transport.send([ANONYMOUS]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts one /batch/ request with uuids, the install id, GeoIP off and no person profile', async () => {
    const fetchImpl = okFetch();
    const transport = new PostHogTelemetryTransport(
      { apiKey: 'phc_key', host: 'https://eu.i.posthog.com' },
      fetchImpl
    );
    await transport.send([ANONYMOUS]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://eu.i.posthog.com/batch/');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({
      api_key: 'phc_key',
      batch: [
        {
          uuid: 'u-1',
          event: 'cli.command',
          distinct_id: 'install-1',
          timestamp: '2026-10-09T12:00:00.000Z',
          properties: {
            command: 'feat new',
            $process_person_profile: false,
            $geoip_disable: true,
          },
        },
      ],
    });
  });

  it('sets person properties only for identified envelopes', async () => {
    const fetchImpl = okFetch();
    const transport = new PostHogTelemetryTransport(
      { apiKey: 'phc_key', host: 'https://eu.i.posthog.com' },
      fetchImpl
    );
    await transport.send([IDENTIFIED]);

    const body = JSON.parse(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string
    );
    expect(body.batch[0].properties).toMatchObject({
      $process_person_profile: true,
      $geoip_disable: true,
      $set: { githubUsername: 'octo', githubOwners: ['acme'], contactConsent: true },
    });
  });

  it('rejects on a non-2xx response so the flush backs off', async () => {
    const transport = new PostHogTelemetryTransport(
      { apiKey: 'phc_key', host: 'https://eu.i.posthog.com' },
      vi.fn(async () => new Response('nope', { status: 503 }))
    );
    await expect(transport.send([ANONYMOUS])).rejects.toThrow('503');
  });

  it('describes the exact body with the key redacted', () => {
    const transport = new PostHogTelemetryTransport(
      { apiKey: 'phc_secret', host: 'https://eu.i.posthog.com' },
      okFetch()
    );
    const described = transport.describe([ANONYMOUS]) as { api_key: string; batch: unknown[] };
    expect(described.api_key).toBe('<project key>');
    expect(JSON.stringify(described)).not.toContain('phc_secret');
    expect(described.batch).toHaveLength(1);
    expect(transport.destination()).toBe('https://eu.i.posthog.com/batch/');
  });
});
