import { describe, it, expect } from 'vitest';
import {
  BuildMode,
  TelemetryEvent,
  TelemetryProcessKind,
  type Settings,
} from '@/domain/generated/output.js';
import { createDefaultSettings } from '@/domain/factories/settings-defaults.factory.js';
import { OutboxTelemetry } from '@/infrastructure/services/telemetry/outbox-telemetry.js';
import { NoopTelemetry } from '@/infrastructure/services/telemetry/noop-telemetry.js';
import type { ISettingsProvider } from '@/application/ports/output/services/settings-provider.interface.js';
import {
  InMemoryTelemetryOutbox,
  createFakeClock,
  createFakeTelemetryRuntime,
} from '../../../../helpers/telemetry.helper.js';

const NOW = new Date('2026-10-09T12:00:00Z');

function provider(settings: Settings | null): ISettingsProvider {
  return {
    has: () => settings !== null,
    get: () => {
      if (!settings) throw new Error('no settings');
      return settings;
    },
  };
}

function build(options: { env?: Record<string, string>; settings?: Settings | null } = {}) {
  const outbox = new InMemoryTelemetryOutbox();
  const telemetry = new OutboxTelemetry(
    outbox,
    provider(options.settings === undefined ? createDefaultSettings() : options.settings),
    createFakeTelemetryRuntime({ env: options.env, processKind: TelemetryProcessKind.Worker }),
    createFakeClock(NOW)
  );
  return { outbox, telemetry };
}

describe('OutboxTelemetry', () => {
  it('queues the event with a fresh uuid, the capture time and the process kind', () => {
    const { outbox, telemetry } = build();
    telemetry.record(TelemetryEvent.PrOpened, { buildMode: BuildMode.Fast });

    expect(outbox.list(10)).toEqual([
      {
        id: 'uuid-1',
        event: TelemetryEvent.PrOpened,
        properties: { buildMode: BuildMode.Fast, process: TelemetryProcessKind.Worker },
        capturedAt: NOW,
        attempts: 0,
        nextAttemptAt: NOW,
      },
    ]);
  });

  it('records a once-keyed event a single time and stores only the key hash', () => {
    const { outbox, telemetry } = build();
    telemetry.record(
      TelemetryEvent.PrMerged,
      { buildMode: BuildMode.Spec, viaPullRequest: true },
      { onceKey: 'pr.merged:f1' }
    );
    telemetry.record(
      TelemetryEvent.PrMerged,
      { buildMode: BuildMode.Spec, viaPullRequest: true },
      { onceKey: 'pr.merged:f1' }
    );

    expect(outbox.count()).toBe(1);
    expect([...outbox.claimed]).toEqual(['sha256(pr.merged:f1)']);
  });

  it.each([
    [
      'the user opted out',
      {
        settings: {
          ...createDefaultSettings(),
          telemetry: { enabled: false, includeIdentity: true, contactConsent: false },
        },
      },
    ],
    ['CI is set', { env: { CI: 'true' } }],
    ['under tests', { env: { VITEST: 'true' } }],
  ])('stores nothing when %s', (_why, options) => {
    const { outbox, telemetry } = build(options);
    telemetry.record(TelemetryEvent.CliCommand, { command: 'ui' });
    expect(outbox.count()).toBe(0);
  });

  it('stores nothing before settings are loaded', () => {
    const { outbox, telemetry } = build({ settings: null });
    telemetry.record(TelemetryEvent.CliCommand, { command: 'ui' });
    expect(outbox.count()).toBe(0);
  });

  it('never throws when the outbox fails', () => {
    const outbox = new InMemoryTelemetryOutbox();
    outbox.enqueue = () => {
      throw new Error('SQLITE_BUSY');
    };
    const telemetry = new OutboxTelemetry(
      outbox,
      provider(createDefaultSettings()),
      createFakeTelemetryRuntime(),
      createFakeClock(NOW)
    );
    expect(() => telemetry.record(TelemetryEvent.CliCommand, { command: 'ui' })).not.toThrow();
  });
});

describe('NoopTelemetry', () => {
  it('accepts events and does nothing', () => {
    expect(() =>
      new NoopTelemetry().record(TelemetryEvent.CliCommand, { command: 'ui' })
    ).not.toThrow();
  });
});
