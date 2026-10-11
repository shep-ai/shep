/**
 * Telemetry Runtime Port (spec 133)
 *
 * The process facts telemetry depends on, behind a port so use cases never
 * read `process.env` or `Math.random` directly and tests can pin them.
 */

import type { TelemetryProcessKind } from '../../../../domain/generated/output.js';
import type { TelemetryEnv } from '../../../../domain/shared/telemetry/telemetry-state.js';

export interface TelemetryPlatform {
  os: string;
  arch: string;
  nodeVersion: string;
  shepVersion: string;
}

export interface ITelemetryRuntime {
  /** Environment variables (CI, DO_NOT_TRACK, …). */
  env(): TelemetryEnv;

  /** Which kind of Shep process this is. */
  processKind(): TelemetryProcessKind;

  platform(): TelemetryPlatform;

  /** A new random UUID. */
  randomUuid(): string;

  /** A random number in [0, 1), for retry jitter. */
  random(): number;

  /** SHA-256 hex of the input. */
  sha256(input: string): string;
}
