/**
 * PostHog delivery configuration (spec 133).
 *
 * The project key comes from `SHEP_POSTHOG_KEY`, else from the constant below:
 * the Shep team's PostHog project (EU cloud). A PostHog project key is a public
 * write-only key, not a secret, so it lives in source. Whether anything is sent
 * is decided by the telemetry state (opt-out, CI, DO_NOT_TRACK, tests), never by
 * the key.
 */

import {
  TELEMETRY_ENV,
  type TelemetryEnv,
} from '../../../domain/shared/telemetry/telemetry-state.js';

/** The Shep team's PostHog project key (public, write-only). */
export const BUILT_IN_POSTHOG_KEY = 'phc_qESdnwYa5rM7GLxVt3C7ScMVwGjuikSmPJrrczvkN6EW';

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
