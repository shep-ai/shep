/**
 * Record Unhandled Error Use Case (spec 133)
 *
 * Records `error.unhandled` from a process's crash handler with only the
 * error's class and a truncated hash of its top stack frame — never the
 * message or stack, which can hold paths and user content. Synchronous so it
 * completes before the handler exits the process, and never throws.
 */

import { injectable, inject } from 'tsyringe';
import { TelemetryEvent } from '../../../domain/generated/output.js';
import type { ITelemetry } from '../../ports/output/services/telemetry.interface.js';
import type { ITelemetryRuntime } from '../../ports/output/services/telemetry-runtime.interface.js';
import {
  errorClassOf,
  topStackFrame,
} from '../../../domain/shared/telemetry/telemetry-error-source.js';

/** Hex characters of the frame hash that are sent — enough to group, short enough to be opaque. */
const SOURCE_HASH_LENGTH = 16;
const UNKNOWN_SOURCE = 'unknown';

@injectable()
export class RecordUnhandledErrorUseCase {
  constructor(
    @inject('ITelemetry')
    private readonly telemetry: ITelemetry,
    @inject('ITelemetryRuntime')
    private readonly runtime: ITelemetryRuntime
  ) {}

  execute(error: unknown): void {
    try {
      const frame = topStackFrame(error instanceof Error ? error.stack : undefined);
      this.telemetry.record(TelemetryEvent.ErrorUnhandled, {
        errorClass: errorClassOf(error),
        sourceHash: frame
          ? this.runtime.sha256(frame).slice(0, SOURCE_HASH_LENGTH)
          : UNKNOWN_SOURCE,
      });
    } catch {
      // A crash handler must never fail on telemetry.
    }
  }
}
