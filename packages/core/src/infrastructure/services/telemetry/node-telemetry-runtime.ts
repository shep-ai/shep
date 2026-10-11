/**
 * Node runtime facts for telemetry (spec 133).
 *
 * The process kind is set once by each process entry point (the daemon and the
 * feature-agent worker); everything else defaults to a CLI invocation. This is
 * infrastructure bootstrapping state, so the module-level value is allowed.
 */

import { createHash, randomUUID } from 'node:crypto';
import { arch, platform } from 'node:os';
import { TelemetryProcessKind } from '../../../domain/generated/output.js';
import type {
  ITelemetryRuntime,
  TelemetryPlatform,
} from '../../../application/ports/output/services/telemetry-runtime.interface.js';
import type { IVersionService } from '../../../application/ports/output/services/version-service.interface.js';
import type { TelemetryEnv } from '../../../domain/shared/telemetry/telemetry-state.js';

let currentProcessKind: TelemetryProcessKind = TelemetryProcessKind.Cli;

/** Called by a process entry point before it records anything. */
export function setTelemetryProcessKind(kind: TelemetryProcessKind): void {
  currentProcessKind = kind;
}

export class NodeTelemetryRuntime implements ITelemetryRuntime {
  constructor(private readonly versionService: IVersionService) {}

  env(): TelemetryEnv {
    return process.env;
  }

  processKind(): TelemetryProcessKind {
    return currentProcessKind;
  }

  platform(): TelemetryPlatform {
    return {
      os: platform(),
      arch: arch(),
      nodeVersion: process.versions.node,
      shepVersion: this.versionService.getVersion().version,
    };
  }

  randomUuid(): string {
    return randomUUID();
  }

  random(): number {
    return Math.random();
  }

  sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}
