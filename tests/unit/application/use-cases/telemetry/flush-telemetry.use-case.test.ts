import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { AgentType, TelemetryEvent, type TelemetryConfig } from '@/domain/generated/output.js';
import { FlushTelemetryUseCase } from '@/application/use-cases/telemetry/flush-telemetry.use-case.js';
import { TelemetryEnvelopeBuilder } from '@/application/use-cases/telemetry/telemetry-envelope-builder.js';
import {
  TELEMETRY_MAX_SEND_ATTEMPTS,
  telemetryRetryDelayMs,
} from '@/domain/shared/telemetry/telemetry-delivery.js';
import {
  InMemoryTelemetryOutbox,
  RecordingTelemetryTransport,
  createFakeClock,
  createFakeTelemetryRuntime,
  createIdentityProviderDouble,
  createSettingsRepositoryDouble,
} from '../../../../helpers/telemetry.helper.js';

const NOW = new Date('2026-10-09T12:00:00Z');
const CAP = 5_000;
const IDENTITY = {
  agentAccountHash: 'hash-abc',
  agentAccountSource: AgentType.ClaudeCode,
  githubUsername: 'octo',
  githubOwners: ['acme'],
};

function telemetry(overrides: Partial<TelemetryConfig> = {}): TelemetryConfig {
  return {
    enabled: true,
    includeIdentity: true,
    contactConsent: false,
    installId: 'install-1',
    ...overrides,
  };
}

describe('FlushTelemetryUseCase', () => {
  let outbox: InMemoryTelemetryOutbox;
  let transport: RecordingTelemetryTransport;
  let identity: ReturnType<typeof createIdentityProviderDouble>;
  let clock: ReturnType<typeof createFakeClock>;

  function build(config: TelemetryConfig = telemetry(), env: Record<string, string> = {}) {
    const settingsRepo = createSettingsRepositoryDouble({ telemetry: config });
    const runtime = createFakeTelemetryRuntime({ env, random: 0.5 });
    const builder = new TelemetryEnvelopeBuilder(settingsRepo, identity, runtime);
    return {
      settingsRepo,
      useCase: new FlushTelemetryUseCase(outbox, settingsRepo, transport, builder, runtime, clock),
    };
  }

  function enqueue(id: string, offsetMs = 0) {
    outbox.enqueue(
      {
        id,
        event: TelemetryEvent.CliCommand,
        properties: { command: 'feat new', process: 'cli' },
        capturedAt: new Date(NOW.getTime() - 60_000 + offsetMs),
      },
      { cap: CAP }
    );
  }

  beforeEach(() => {
    outbox = new InMemoryTelemetryOutbox();
    transport = new RecordingTelemetryTransport();
    identity = createIdentityProviderDouble(IDENTITY);
    clock = createFakeClock(NOW);
  });

  it('sends due events keyed by the install id with platform properties, then removes them', async () => {
    enqueue('e1');
    const result = await build().useCase.execute();

    expect(result).toEqual({ sent: 1, failed: 0, dropped: 0, skipped: null });
    expect(transport.batches).toHaveLength(1);
    expect(transport.batches[0][0]).toMatchObject({
      uuid: 'e1',
      event: 'cli.command',
      distinctId: 'install-1',
      properties: {
        command: 'feat new',
        process: 'cli',
        shepVersion: '1.2.3',
        os: 'linux',
        arch: 'x64',
        nodeVersion: '22.0.0',
        contactConsent: false,
      },
    });
    expect(outbox.count()).toBe(0);
  });

  it('attaches identity as event and person properties when identity is on', async () => {
    enqueue('e1');
    await build(telemetry({ contactConsent: true })).useCase.execute();

    const envelope = transport.batches[0][0];
    expect(envelope.properties).toMatchObject({
      agentAccountHash: 'hash-abc',
      agentAccountSource: AgentType.ClaudeCode,
      githubUsername: 'octo',
      githubOwners: ['acme'],
      contactConsent: true,
    });
    expect(envelope.personProperties).toEqual({
      githubUsername: 'octo',
      githubOwners: ['acme'],
      contactConsent: true,
    });
  });

  it('strips identity from already-queued events once identity is off', async () => {
    enqueue('e1');
    await build(telemetry({ includeIdentity: false })).useCase.execute();

    const envelope = transport.batches[0][0];
    expect(envelope.properties).not.toHaveProperty('agentAccountHash');
    expect(envelope.properties).not.toHaveProperty('githubUsername');
    expect(envelope.properties).not.toHaveProperty('githubOwners');
    expect(envelope.personProperties).toBeUndefined();
    expect(identity.resolve).not.toHaveBeenCalled();
  });

  it.each([
    ['the user opted out', telemetry({ enabled: false }), {}],
    ['CI is set', telemetry(), { CI: 'true' }],
    ['DO_NOT_TRACK is set', telemetry(), { DO_NOT_TRACK: '1' }],
  ])('clears the outbox and sends nothing when %s', async (_why, config, env) => {
    enqueue('e1');
    const result = await build(config, env).useCase.execute();

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe('disabled');
    expect(transport.batches).toHaveLength(0);
    expect(outbox.count()).toBe(0);
  });

  it('keeps events queued and sends nothing without a project key', async () => {
    transport.configured = false;
    enqueue('e1');
    const result = await build().useCase.execute();

    expect(result.skipped).toBe('unconfigured');
    expect(transport.batches).toHaveLength(0);
    expect(outbox.count()).toBe(1);
  });

  it('backs off with jitter after a failed send and stops for this flush', async () => {
    transport.failing = true;
    enqueue('e1');
    const result = await build().useCase.execute();

    expect(result).toMatchObject({ sent: 0, failed: 1, dropped: 0 });
    expect(outbox.list(1)[0]).toMatchObject({
      attempts: 1,
      nextAttemptAt: new Date(NOW.getTime() + telemetryRetryDelayMs(1, 0.5)),
    });
  });

  it(`drops a batch on its ${TELEMETRY_MAX_SEND_ATTEMPTS}th failed send`, async () => {
    transport.failing = true;
    enqueue('e1');
    const { useCase } = build();
    for (let attempt = 1; attempt < TELEMETRY_MAX_SEND_ATTEMPTS; attempt++) {
      await useCase.execute();
      clock.set(outbox.list(1)[0].nextAttemptAt);
    }
    const last = await useCase.execute();

    expect(last.dropped).toBe(1);
    expect(outbox.count()).toBe(0);
  });

  it('does not send an event that is still backing off', async () => {
    enqueue('e1');
    outbox.recordFailure(['e1'], new Date(NOW.getTime() + 1_000));
    const result = await build().useCase.execute();

    expect(result.sent).toBe(0);
    expect(outbox.count()).toBe(1);
  });

  it('sends in batches of 20', async () => {
    for (let i = 0; i < 45; i++) enqueue(`e${i}`, i);
    await build().useCase.execute();

    expect(transport.batches.map((b) => b.length)).toEqual([20, 20, 5]);
  });

  it('assigns and persists an install id when the settings have none', async () => {
    enqueue('e1');
    const { useCase, settingsRepo } = build(telemetry({ installId: undefined }));
    await useCase.execute();

    expect(transport.batches[0][0].distinctId).toBe('uuid-1');
    expect(settingsRepo.current.telemetry?.installId).toBe('uuid-1');
  });
});
