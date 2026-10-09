import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import {
  AgentType,
  OnboardingStep,
  SdlcLifecycle,
  TelemetryEvent,
  type TelemetryConfig,
} from '@/domain/generated/output.js';
import { RecordInstallHeartbeatUseCase } from '@/application/use-cases/telemetry/record-install-heartbeat.use-case.js';
import { RecordTelemetryEventUseCase } from '@/application/use-cases/telemetry/record-telemetry-event.use-case.js';
import { RecordUnhandledErrorUseCase } from '@/application/use-cases/telemetry/record-unhandled-error.use-case.js';
import { RUNNING_LIFECYCLES } from '@/domain/shared/parallel-feature-limit.js';
import type { IRepositoryRepository } from '@/application/ports/output/repositories/repository-repository.interface.js';
import type { IFeatureRepository } from '@/application/ports/output/repositories/feature-repository.interface.js';
import {
  createFakeClock,
  createFakeTelemetryRuntime,
  createSettingsRepositoryDouble,
  createTelemetryDouble,
} from '../../../../helpers/telemetry.helper.js';

const NOW = new Date('2026-10-09T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function telemetry(overrides: Partial<TelemetryConfig> = {}): TelemetryConfig {
  return {
    enabled: true,
    includeIdentity: true,
    contactConsent: false,
    installId: 'i',
    ...overrides,
  };
}

describe('RecordInstallHeartbeatUseCase', () => {
  function build(config: TelemetryConfig, env: Record<string, string> = {}) {
    const settingsRepo = createSettingsRepositoryDouble({ telemetry: config });
    settingsRepo.current.featureFlags = {
      ...settingsRepo.current.featureFlags!,
      aspm: true,
      clusters: false,
    };
    const telemetryPort = createTelemetryDouble();
    const repositories = {
      list: vi.fn(async () => [{}, {}]),
    } as unknown as IRepositoryRepository;
    const features = {
      countByLifecycles: vi.fn(async () => 3),
    } as unknown as IFeatureRepository;
    const useCase = new RecordInstallHeartbeatUseCase(
      settingsRepo,
      telemetryPort,
      repositories,
      features,
      createFakeTelemetryRuntime({ env }),
      createFakeClock(NOW)
    );
    return { useCase, telemetryPort, settingsRepo, features };
  }

  it('records one heartbeat with counts and enabled flag names, then stamps the time', async () => {
    const { useCase, telemetryPort, settingsRepo, features } = build(telemetry());

    expect(await useCase.execute()).toBe(true);
    const [event, props] = telemetryPort.record.mock.calls[0];
    expect(event).toBe(TelemetryEvent.InstallHeartbeat);
    expect(props).toMatchObject({
      agentType: AgentType.ClaudeCode,
      repositoryCount: 2,
      activeFeatureCount: 3,
    });
    expect(props.enabledFeatureFlags).toContain('aspm');
    expect(props.enabledFeatureFlags).not.toContain('clusters');
    expect(features.countByLifecycles).toHaveBeenCalledWith([...RUNNING_LIFECYCLES]);
    expect(settingsRepo.current.telemetry?.lastHeartbeatAt).toEqual(NOW);
  });

  it('skips when the last heartbeat is less than a day old', async () => {
    const { useCase, telemetryPort } = build(
      telemetry({ lastHeartbeatAt: new Date(NOW.getTime() - DAY_MS + 1) })
    );
    expect(await useCase.execute()).toBe(false);
    expect(telemetryPort.record).not.toHaveBeenCalled();
  });

  it('records again once a day has passed', async () => {
    const { useCase } = build(telemetry({ lastHeartbeatAt: new Date(NOW.getTime() - DAY_MS) }));
    expect(await useCase.execute()).toBe(true);
  });

  it('skips while telemetry is off', async () => {
    const { useCase, telemetryPort } = build(telemetry(), { DO_NOT_TRACK: '1' });
    expect(await useCase.execute()).toBe(false);
    expect(telemetryPort.record).not.toHaveBeenCalled();
  });

  it('never counts a lifecycle outside the running set', () => {
    expect(RUNNING_LIFECYCLES.has(SdlcLifecycle.Archived)).toBe(false);
  });
});

describe('RecordTelemetryEventUseCase', () => {
  it('forwards a typed event to the telemetry port', () => {
    const telemetryPort = createTelemetryDouble();
    new RecordTelemetryEventUseCase(telemetryPort).execute(TelemetryEvent.OnboardingStep, {
      step: OnboardingStep.ProjectAdded,
      completed: true,
    });
    expect(telemetryPort.record).toHaveBeenCalledWith(
      TelemetryEvent.OnboardingStep,
      { step: OnboardingStep.ProjectAdded, completed: true },
      undefined
    );
  });
});

describe('RecordUnhandledErrorUseCase', () => {
  it('records the error class and a hash of the top frame, never the message', () => {
    const telemetryPort = createTelemetryDouble();
    const error = new TypeError('secret /home/alice/repo');
    error.stack = 'TypeError: secret\n    at go (/home/alice/dist/go.js:3:4)';

    new RecordUnhandledErrorUseCase(telemetryPort, createFakeTelemetryRuntime()).execute(error);

    expect(telemetryPort.record).toHaveBeenCalledWith(TelemetryEvent.ErrorUnhandled, {
      errorClass: 'TypeError',
      sourceHash: 'sha256(go@go.js:3)'.slice(0, 16),
    });
    expect(JSON.stringify(telemetryPort.record.mock.calls)).not.toContain('secret');
  });

  it('never throws, even when recording fails', () => {
    const telemetryPort = createTelemetryDouble();
    telemetryPort.record.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() =>
      new RecordUnhandledErrorUseCase(telemetryPort, createFakeTelemetryRuntime()).execute('x')
    ).not.toThrow();
  });
});
