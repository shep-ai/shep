/**
 * Telemetry enabled-state resolution (spec 133).
 *
 * Telemetry is opt-out: on unless the user turned it off. The environment
 * always wins over the user's choice — CI, DO_NOT_TRACK, SHEP_TELEMETRY_DISABLED
 * and test runners force it off.
 */

import { TelemetryDisabledReason } from '../../generated/output';
import type { TelemetryConfig } from '../../generated/output';

/** Environment variables telemetry reads. */
export const TELEMETRY_ENV = {
  ci: 'CI',
  doNotTrack: 'DO_NOT_TRACK',
  disabled: 'SHEP_TELEMETRY_DISABLED',
  vitest: 'VITEST',
  nodeEnv: 'NODE_ENV',
  posthogKey: 'SHEP_POSTHOG_KEY',
  posthogHost: 'SHEP_POSTHOG_HOST',
} as const;

const TEST_NODE_ENV = 'test';
const FALSE_VALUES: ReadonlySet<string> = new Set(['', '0', 'false', 'no', 'off']);

export type TelemetryEnv = Readonly<Record<string, string | undefined>>;

export interface TelemetryState {
  enabled: boolean;
  /** Why telemetry is off; null when it is on. */
  reason: TelemetryDisabledReason | null;
}

/** True for a set environment flag ("1", "true", "yes"…); false for unset/"0"/"false". */
export function isEnvFlagSet(value: string | undefined): boolean {
  if (value === undefined) return false;
  return !FALSE_VALUES.has(value.trim().toLowerCase());
}

/**
 * Resolve whether telemetry is on. Environment reasons are checked first, in a
 * fixed order, so `status` reports the most specific cause.
 */
export function resolveTelemetryState(
  env: TelemetryEnv,
  config: Pick<TelemetryConfig, 'enabled'> | undefined
): TelemetryState {
  const environmentReasons: readonly [boolean, TelemetryDisabledReason][] = [
    [isEnvFlagSet(env[TELEMETRY_ENV.ci]), TelemetryDisabledReason.Ci],
    [isEnvFlagSet(env[TELEMETRY_ENV.doNotTrack]), TelemetryDisabledReason.DoNotTrack],
    [isEnvFlagSet(env[TELEMETRY_ENV.disabled]), TelemetryDisabledReason.EnvDisabled],
    [
      isEnvFlagSet(env[TELEMETRY_ENV.vitest]) || env[TELEMETRY_ENV.nodeEnv] === TEST_NODE_ENV,
      TelemetryDisabledReason.Test,
    ],
  ];
  for (const [applies, reason] of environmentReasons) {
    if (applies) return { enabled: false, reason };
  }
  if (config?.enabled === false) {
    return { enabled: false, reason: TelemetryDisabledReason.UserOptOut };
  }
  return { enabled: true, reason: null };
}

/** Preferences of an install that never changed them: on, with identity, no contact consent. */
export const DEFAULT_TELEMETRY_PREFERENCES: Readonly<
  Pick<TelemetryConfig, 'enabled' | 'includeIdentity' | 'contactConsent'>
> = {
  enabled: true,
  includeIdentity: true,
  contactConsent: false,
};

/** The stored telemetry config with defaults filled in for older settings rows. */
export function telemetryConfigOf(settings: { telemetry?: TelemetryConfig }): TelemetryConfig {
  return { ...DEFAULT_TELEMETRY_PREFERENCES, ...settings.telemetry };
}
