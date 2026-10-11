import { describe, it, expect } from 'vitest';
import { TelemetryDisabledReason } from '@/domain/generated/output.js';
import { resolveTelemetryState } from '@/domain/shared/telemetry/telemetry-state.js';

const ON = { enabled: true, includeIdentity: true, contactConsent: false };

describe('resolveTelemetryState', () => {
  it('is enabled with no environment overrides and the default config', () => {
    expect(resolveTelemetryState({}, ON)).toEqual({ enabled: true, reason: null });
  });

  it('treats a missing config as the default (on)', () => {
    expect(resolveTelemetryState({}, undefined)).toEqual({ enabled: true, reason: null });
  });

  it('is off when the user opted out', () => {
    expect(resolveTelemetryState({}, { ...ON, enabled: false })).toEqual({
      enabled: false,
      reason: TelemetryDisabledReason.UserOptOut,
    });
  });

  it.each([
    [{ CI: 'true' }, TelemetryDisabledReason.Ci],
    [{ CI: '1' }, TelemetryDisabledReason.Ci],
    [{ DO_NOT_TRACK: '1' }, TelemetryDisabledReason.DoNotTrack],
    [{ DO_NOT_TRACK: 'true' }, TelemetryDisabledReason.DoNotTrack],
    [{ SHEP_TELEMETRY_DISABLED: '1' }, TelemetryDisabledReason.EnvDisabled],
    [{ SHEP_TELEMETRY_DISABLED: 'TRUE' }, TelemetryDisabledReason.EnvDisabled],
    [{ VITEST: 'true' }, TelemetryDisabledReason.Test],
    [{ NODE_ENV: 'test' }, TelemetryDisabledReason.Test],
  ])('is off for %o with reason %s', (env, reason) => {
    expect(resolveTelemetryState(env, ON)).toEqual({ enabled: false, reason });
  });

  it.each([
    { CI: '' },
    { CI: 'false' },
    { CI: '0' },
    { DO_NOT_TRACK: '0' },
    { NODE_ENV: 'production' },
  ])('ignores an unset or false-y value %o', (env) => {
    expect(resolveTelemetryState(env, ON).enabled).toBe(true);
  });

  it('reports the environment reason ahead of the user opt-out', () => {
    expect(resolveTelemetryState({ CI: 'true' }, { ...ON, enabled: false }).reason).toBe(
      TelemetryDisabledReason.Ci
    );
  });
});
