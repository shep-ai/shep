/**
 * PostHog delivery configuration (spec 133).
 *
 * The project key comes from `SHEP_POSTHOG_KEY`, else from the build-time
 * constant below. Release builds may substitute a key into the constant; it is
 * empty in source, so a build without a key sends nothing. A PostHog project
 * key is a public write-only key, not a secret.
 */

import {
  TELEMETRY_ENV,
  type TelemetryEnv,
} from '../../../domain/shared/telemetry/telemetry-state.js';

/** Build-time project key. Empty means "do not send". */
export const BUILT_IN_POSTHOG_KEY = '';

/** PostHog EU cloud ingestion host. */
export const DEFAULT_POSTHOG_HOST = 'https://eu.i.posthog.com';

export interface PostHogConfig {
  apiKey: string | null;
  host: string;
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function resolvePostHogConfig(
  env: TelemetryEnv,
  builtInKey: string = BUILT_IN_POSTHOG_KEY
): PostHogConfig {
  const host = nonEmpty(env[TELEMETRY_ENV.posthogHost]) ?? DEFAULT_POSTHOG_HOST;
  return {
    apiKey: nonEmpty(env[TELEMETRY_ENV.posthogKey]) ?? nonEmpty(builtInKey),
    host: host.replace(/\/+$/, ''),
  };
}
