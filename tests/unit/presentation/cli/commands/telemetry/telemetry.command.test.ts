import 'reflect-metadata';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { TelemetryDisabledReason } from '@/domain/generated/output.js';

const { mockResolve } = vi.hoisted(() => ({ mockResolve: vi.fn() }));

vi.mock('@/infrastructure/di/container.js', () => ({
  container: { resolve: (...args: unknown[]) => mockResolve(...args) },
}));

import { initI18n } from '../../../../../../src/presentation/cli/i18n.js';
import { createTelemetryCommand } from '../../../../../../src/presentation/cli/commands/telemetry/index.js';

const STATUS_ON = {
  enabled: true,
  reason: null,
  includeIdentity: true,
  contactConsent: false,
  installId: 'install-1',
  queuedEvents: 3,
  configured: true,
  destination: 'https://eu.i.posthog.com/batch/',
};

describe('shep telemetry', () => {
  const setPreferences = vi.fn();
  const getStatus = vi.fn();
  const preview = vi.fn();
  let logs: string[];

  beforeAll(async () => {
    await initI18n('en');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    process.exitCode = undefined;
    setPreferences.mockResolvedValue({ telemetry: { enabled: true } });
    getStatus.mockResolvedValue(STATUS_ON);
    preview.mockResolvedValue({
      enabled: true,
      configured: true,
      destination: 'https://eu.i.posthog.com/batch/',
      queuedEvents: 1,
      body: { api_key: '<project key>', batch: [{ event: 'cli.command' }] },
    });
    mockResolve.mockImplementation((token: { name?: string }) => {
      switch (token.name) {
        case 'SetTelemetryPreferencesUseCase':
          return { execute: setPreferences };
        case 'GetTelemetryStatusUseCase':
          return { execute: getStatus };
        case 'PreviewTelemetryUseCase':
          return { execute: preview };
        default:
          throw new Error(`unexpected token ${String(token.name)}`);
      }
    });
  });

  async function run(...args: string[]) {
    await createTelemetryCommand().parseAsync(args, { from: 'user' });
  }

  it('turns metrics off and confirms', async () => {
    await run('off');

    expect(setPreferences).toHaveBeenCalledWith({ enabled: false });
    expect(logs.join('\n')).toContain('Usage metrics are off. Queued events were deleted.');
  });

  it('turns metrics on and warns when the environment still forces them off', async () => {
    getStatus.mockResolvedValue({
      ...STATUS_ON,
      enabled: false,
      reason: TelemetryDisabledReason.DoNotTrack,
    });
    await run('on');

    expect(setPreferences).toHaveBeenCalledWith({ enabled: true });
    expect(logs.join('\n')).toContain('Usage metrics are on.');
    expect(logs.join('\n')).toContain('DO_NOT_TRACK is set');
  });

  it.each([
    ['identity', 'off', { includeIdentity: false }, 'Your identity will be left out'],
    ['identity', 'on', { includeIdentity: true }, 'Your identity will be included'],
    ['contact', 'on', { contactConsent: true }, 'may contact you on GitHub'],
    ['contact', 'off', { contactConsent: false }, 'will not contact you'],
  ])('%s %s sets %o', async (sub, state, expected, message) => {
    await run(sub, state);
    expect(setPreferences).toHaveBeenCalledWith(expected);
    expect(logs.join('\n')).toContain(message);
  });

  it('rejects a state other than on or off without exiting the process', async () => {
    await run('identity', 'maybe');
    expect(setPreferences).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    expect(logs.join('\n')).toContain('Expected "on" or "off", got "maybe"');
  });

  it('prints the status', async () => {
    await run('status');
    const out = logs.join('\n');
    expect(out).toContain('Usage metrics');
    expect(out).toContain('install-1');
    expect(out).toContain('https://eu.i.posthog.com/batch/');
    expect(out).toContain('3');
  });

  it('names the reason in the status when metrics are off', async () => {
    getStatus.mockResolvedValue({
      ...STATUS_ON,
      enabled: false,
      reason: TelemetryDisabledReason.Ci,
    });
    await run('status');
    expect(logs.join('\n')).toContain('the CI environment variable is set');
  });

  it('show prints the wire body as JSON', async () => {
    await run('show');
    const out = logs.join('\n');
    expect(out).toContain('"api_key": "<project key>"');
    expect(out).toContain('"event": "cli.command"');
  });

  it('show says when nothing is queued or no key is configured', async () => {
    preview.mockResolvedValue({
      enabled: true,
      configured: false,
      destination: 'https://eu.i.posthog.com/batch/',
      queuedEvents: 0,
      body: { batch: [] },
    });
    await run('show');
    const out = logs.join('\n');
    expect(out).toContain('Nothing is queued.');
    expect(out).toContain('No project key is configured');
  });
});
