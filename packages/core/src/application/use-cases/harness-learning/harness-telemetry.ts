/**
 * Content-free telemetry for self-learning (spec 150): enums, counts and
 * booleans only — never paths, component text, feedback, feature names or ids.
 */

import {
  TelemetryEvent,
  type HarnessComponent,
  type HarnessComponentKind,
  type HarnessRefinementRun,
} from '../../../domain/generated/output.js';
import type { ITelemetry } from '../../ports/output/services/telemetry.interface.js';

export function componentStats(components: readonly HarnessComponent[]): {
  componentCount: number;
  componentKinds: HarnessComponentKind[];
} {
  return {
    componentCount: components.length,
    componentKinds: [...new Set(components.map((c) => c.kind))].sort(),
  };
}

export function recordRefinementFinished(telemetry: ITelemetry, run: HarnessRefinementRun): void {
  telemetry.record(TelemetryEvent.HarnessRefinementFinished, {
    mode: run.mode,
    status: run.status,
    k: run.k,
    rollouts: run.rollouts,
    sessions: run.sessions,
  });
}
