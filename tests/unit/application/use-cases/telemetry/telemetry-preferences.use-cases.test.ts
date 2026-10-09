import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  AgentType,
  TelemetryDisabledReason,
  TelemetryEvent,
  type TelemetryConfig,
} from '@/domain/generated/output.js';
import { GetTelemetryStatusUseCase } from '@/application/use-cases/telemetry/get-telemetry-status.use-case.js';
import { SetTelemetryPreferencesUseCase } from '@/application/use-cases/telemetry/set-telemetry-preferences.use-case.js';
import { PreviewTelemetryUseCase } from '@/application/use-cases/telemetry/preview-telemetry.use-case.js';
import { AcknowledgeTelemetryNoticeUseCase } from '@/application/use-cases/telemetry/acknowledge-telemetry-notice.use-case.js';
import { TelemetryEnvelopeBuilder } from '@/application/use-cases/telemetry/telemetry-envelope-builder.js';
import { TELEMETRY_NOTICE_FIELDS } from '@/domain/shared/telemetry/telemetry-notice.js';
import {
  InMemoryTelemetryOutbox,
  RecordingTelemetryTransport,
  createFakeClock,
  createFakeTelemetryRuntime,
  createIdentityProviderDouble,
  createSettingsRepositoryDouble,
} from '../../../../helpers/telemetry.helper.js';

const NOW = new Date('2026-10-09T12:00:00Z');

function telemetry(overrides: Partial<TelemetryConfig> = {}): TelemetryConfig {
  return {
    enabled: true,
    includeIdentity: true,
    contactConsent: false,
    installId: 'i-1',
    ...overrides,
  };
}

function enqueueOne(outbox: InMemoryTelemetryOutbox) {
  outbox.enqueue(
    { id: 'e1', event: TelemetryEvent.CliCommand, properties: { command: 'ui' }, capturedAt: NOW },
    { cap: 10 }
  );
}

describe('GetTelemetryStatusUseCase', () => {
  it('reports state, preferences, queue size and destination', async () => {
    const outbox = new InMemoryTelemetryOutbox();
    enqueueOne(outbox);
    const useCase = new GetTelemetryStatusUseCase(
      createSettingsRepositoryDouble({ telemetry: telemetry({ contactConsent: true }) }),
      outbox,
      new RecordingTelemetryTransport(),
      createFakeTelemetryRuntime()
    );

    expect(await useCase.execute()).toEqual({
      enabled: true,
      reason: null,
      includeIdentity: true,
      contactConsent: true,
      installId: 'i-1',
      queuedEvents: 1,
      configured: true,
      destination: 'https://analytics.example/batch/',
    });
  });

  it('names the environment reason when telemetry is forced off', async () => {
    const useCase = new GetTelemetryStatusUseCase(
      createSettingsRepositoryDouble({ telemetry: telemetry() }),
      new InMemoryTelemetryOutbox(),
      new RecordingTelemetryTransport(),
      createFakeTelemetryRuntime({ env: { SHEP_TELEMETRY_DISABLED: '1' } })
    );
    expect(await useCase.execute()).toMatchObject({
      enabled: false,
      reason: TelemetryDisabledReason.EnvDisabled,
    });
  });
});

describe('SetTelemetryPreferencesUseCase', () => {
  let outbox: InMemoryTelemetryOutbox;
  let settingsRepo: ReturnType<typeof createSettingsRepositoryDouble>;
  let useCase: SetTelemetryPreferencesUseCase;

  beforeEach(() => {
    outbox = new InMemoryTelemetryOutbox();
    settingsRepo = createSettingsRepositoryDouble({ telemetry: telemetry() });
    useCase = new SetTelemetryPreferencesUseCase(settingsRepo, outbox);
  });

  it('turning telemetry off persists it and deletes everything queued', async () => {
    enqueueOne(outbox);
    const settings = await useCase.execute({ enabled: false });

    expect(settings.telemetry?.enabled).toBe(false);
    expect(settingsRepo.current.telemetry?.enabled).toBe(false);
    expect(outbox.count()).toBe(0);
  });

  it('changes only the preferences given and keeps the install id', async () => {
    enqueueOne(outbox);
    await useCase.execute({ includeIdentity: false, contactConsent: true });

    expect(settingsRepo.current.telemetry).toEqual(
      telemetry({ includeIdentity: false, contactConsent: true })
    );
    expect(outbox.count()).toBe(1);
  });
});

describe('PreviewTelemetryUseCase', () => {
  it('returns the exact wire body the transport would post', async () => {
    const outbox = new InMemoryTelemetryOutbox();
    enqueueOne(outbox);
    const settingsRepo = createSettingsRepositoryDouble({
      telemetry: telemetry({ includeIdentity: false }),
    });
    const runtime = createFakeTelemetryRuntime();
    const useCase = new PreviewTelemetryUseCase(
      outbox,
      settingsRepo,
      new RecordingTelemetryTransport(),
      new TelemetryEnvelopeBuilder(settingsRepo, createIdentityProviderDouble(), runtime),
      runtime
    );

    const preview = await useCase.execute();
    expect(preview).toMatchObject({
      enabled: true,
      configured: true,
      destination: 'https://analytics.example/batch/',
      queuedEvents: 1,
    });
    expect(preview.body).toMatchObject({
      api_key: '<redacted>',
      batch: [{ uuid: 'e1', event: 'cli.command', distinctId: 'i-1' }],
    });
  });

  it('includes identity in the preview when identity is on', async () => {
    const outbox = new InMemoryTelemetryOutbox();
    enqueueOne(outbox);
    const settingsRepo = createSettingsRepositoryDouble({ telemetry: telemetry() });
    const runtime = createFakeTelemetryRuntime();
    const useCase = new PreviewTelemetryUseCase(
      outbox,
      settingsRepo,
      new RecordingTelemetryTransport(),
      new TelemetryEnvelopeBuilder(
        settingsRepo,
        createIdentityProviderDouble({
          githubUsername: 'octo',
          githubOwners: [],
          agentAccountHash: 'h',
          agentAccountSource: AgentType.CodexCli,
        }),
        runtime
      ),
      runtime
    );
    const body = (await useCase.execute()).body as { batch: { properties: object }[] };
    expect(body.batch[0].properties).toMatchObject({
      githubUsername: 'octo',
      agentAccountHash: 'h',
    });
  });
});

describe('AcknowledgeTelemetryNoticeUseCase', () => {
  it('shows the notice once, listing the collected fields', async () => {
    const settingsRepo = createSettingsRepositoryDouble({ telemetry: telemetry() });
    const useCase = new AcknowledgeTelemetryNoticeUseCase(
      settingsRepo,
      createFakeTelemetryRuntime(),
      createFakeClock(NOW)
    );

    expect(await useCase.execute()).toEqual({ show: true, fields: TELEMETRY_NOTICE_FIELDS });
    expect(settingsRepo.current.telemetry?.noticeShownAt).toEqual(NOW);
    expect(await useCase.execute()).toEqual({ show: false, fields: TELEMETRY_NOTICE_FIELDS });
  });

  it('does not show the notice while telemetry is off', async () => {
    const useCase = new AcknowledgeTelemetryNoticeUseCase(
      createSettingsRepositoryDouble({ telemetry: telemetry() }),
      createFakeTelemetryRuntime({ env: { CI: 'true' } }),
      createFakeClock(NOW)
    );
    expect((await useCase.execute()).show).toBe(false);
  });
});
