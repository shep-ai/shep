'use server';

import { resolve } from '@/lib/server-container';
import type {
  OverrideDevServerRunPlanInput,
  OverrideDevServerRunPlanResult,
  OverrideDevServerRunPlanUseCase,
} from '@shepai/core/application/use-cases/deployments/override-dev-server-run-plan.use-case';

/**
 * Persist a user-authored run plan as `RunPlanSource.Manual`.
 *
 * All validation lives in the use case (FR-19), so this action deliberately
 * checks nothing: a blank command and a `cwd` outside the repository both come
 * back as a `ValidationFailed` result carrying per-field messages the editor
 * renders inline. The same is true of the refusal that is not validation — a
 * repository whose committed `.shep/dev.json` outranks anything writable here.
 */
export async function overrideDevServerRunPlan(
  input: OverrideDevServerRunPlanInput
): Promise<OverrideDevServerRunPlanResult> {
  const useCase = resolve<OverrideDevServerRunPlanUseCase>('OverrideDevServerRunPlanUseCase');
  return useCase.execute(input);
}
