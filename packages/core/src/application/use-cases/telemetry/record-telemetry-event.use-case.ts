/**
 * Record Telemetry Event Use Case (spec 133)
 *
 * The entry point presentation layers use to record a typed event
 * (`cli.command`, `web.area.viewed`, `onboarding.step`). Synchronous and never
 * throws — see ITelemetry.
 */

import { injectable, inject } from 'tsyringe';
import type { TelemetryEvent } from '../../../domain/generated/output.js';
import type {
  ITelemetry,
  TelemetryRecordOptions,
} from '../../ports/output/services/telemetry.interface.js';
import type { TelemetryEventPropertyMap } from '../../ports/output/services/telemetry-events.js';

@injectable()
export class RecordTelemetryEventUseCase {
  constructor(
    @inject('ITelemetry')
    private readonly telemetry: ITelemetry
  ) {}

  execute<E extends TelemetryEvent>(
    event: E,
    properties: TelemetryEventPropertyMap[E],
    options?: TelemetryRecordOptions
  ): void {
    this.telemetry.record(event, properties, options);
  }
}
