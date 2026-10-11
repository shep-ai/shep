import { describe, it, expect } from 'vitest';
import { BuildMode, TelemetryEvent } from '@/domain/generated/output.js';
import {
  recordPrMerged,
  recordPrOpened,
} from '@/infrastructure/services/telemetry/pr-telemetry.js';
import { createTelemetryDouble } from '../../../../helpers/telemetry.helper.js';

const FEATURE = { id: 'feat-1', buildMode: BuildMode.Spec };

describe('PR telemetry', () => {
  it('records pr.opened once per feature with the build mode only', () => {
    const telemetry = createTelemetryDouble();
    recordPrOpened(telemetry, FEATURE);
    expect(telemetry.record).toHaveBeenCalledWith(
      TelemetryEvent.PrOpened,
      { buildMode: BuildMode.Spec },
      { onceKey: 'pr.opened:feat-1' }
    );
  });

  it('records pr.merged once per feature, saying whether a pull request was merged', () => {
    const telemetry = createTelemetryDouble();
    recordPrMerged(telemetry, FEATURE, false);
    expect(telemetry.record).toHaveBeenCalledWith(
      TelemetryEvent.PrMerged,
      { buildMode: BuildMode.Spec, viaPullRequest: false },
      { onceKey: 'pr.merged:feat-1' }
    );
  });
});
