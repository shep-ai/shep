/**
 * Acknowledge Telemetry Notice Use Case (spec 133)
 *
 * Decides whether the first-run notice should be shown and records that it
 * was. Returns `show: true` exactly once per install while telemetry is on;
 * never while it is off (opt-out, CI, DO_NOT_TRACK, tests). The field list
 * comes from the domain so every surface names the same fields.
 */

import { injectable, inject } from 'tsyringe';
import type { ISettingsRepository } from '../../ports/output/repositories/settings.repository.interface.js';
import type { ITelemetryRuntime } from '../../ports/output/services/telemetry-runtime.interface.js';
import type { IClock } from '../../ports/output/services/clock.interface.js';
import {
  resolveTelemetryState,
  telemetryConfigOf,
} from '../../../domain/shared/telemetry/telemetry-state.js';
import {
  TELEMETRY_NOTICE_FIELDS,
  type TelemetryNoticeField,
} from '../../../domain/shared/telemetry/telemetry-notice.js';

export interface TelemetryNotice {
  show: boolean;
  fields: readonly TelemetryNoticeField[];
}

@injectable()
export class AcknowledgeTelemetryNoticeUseCase {
  constructor(
    @inject('ISettingsRepository')
    private readonly settingsRepository: ISettingsRepository,
    @inject('ITelemetryRuntime')
    private readonly runtime: ITelemetryRuntime,
    @inject('IClock')
    private readonly clock: IClock
  ) {}

  async execute(): Promise<TelemetryNotice> {
    const hidden: TelemetryNotice = { show: false, fields: TELEMETRY_NOTICE_FIELDS };
    const settings = await this.settingsRepository.load();
    if (!settings) return hidden;
    const telemetry = settings.telemetry;
    if (!resolveTelemetryState(this.runtime.env(), telemetry).enabled) return hidden;
    if (telemetry?.noticeShownAt) return hidden;

    await this.settingsRepository.update({
      ...settings,
      telemetry: { ...telemetryConfigOf(settings), noticeShownAt: this.clock.now() },
    });
    return { show: true, fields: TELEMETRY_NOTICE_FIELDS };
  }
}
