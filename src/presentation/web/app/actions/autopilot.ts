'use server';

/**
 * Server actions for the Factory page (spec 132). Each calls one use case;
 * a pass waits for the investigations it starts.
 */

import { resolve } from '@/lib/server-container';
import { attemptOutcome } from '@/lib/action-outcome';
import type {
  AutopilotChange,
  ManageAutopilotUseCase,
} from '@shepai/core/application/use-cases/autopilot/manage-autopilot.use-case';
import type { RunAutopilotUseCase } from '@shepai/core/application/use-cases/autopilot/run-autopilot.use-case';

export async function setAutopilot(space: string, change: AutopilotChange) {
  return attemptOutcome(() =>
    resolve<ManageAutopilotUseCase>('ManageAutopilotUseCase').set(space, change)
  );
}

export async function runAutopilot(space: string) {
  return attemptOutcome(() => resolve<RunAutopilotUseCase>('RunAutopilotUseCase').run(space));
}
