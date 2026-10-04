/**
 * Applies a run's space environment to the feature worker (spec 121).
 *
 * A worker serves exactly one run, so its own process.env is run-scoped: every
 * agent CLI (buildSpawnOptions copies process.env at spawn time), every gh call
 * through ExecFunction and every git call it makes inherits the space's
 * logins and identity once this has run. It must run before any executor,
 * plugin server or subprocess starts.
 *
 * Only variable names are logged; values (paths, emails) stay out of the
 * worker log.
 */

import type { AgentType } from '@/domain/generated/output.js';
import type { ResolvedSpaceEnvironment } from '@/application/use-cases/spaces/resolve-space-environment.use-case.js';

export interface RunSpaceEnvironmentInput {
  resolveEnvironment: (
    repositoryPath: string,
    agentType: AgentType
  ) => Promise<ResolvedSpaceEnvironment>;
  /** The repository the run belongs to (not its worktree, which lives under the Shep home). */
  repositoryPath: string;
  /** The agent type the run will use. */
  agentType: AgentType;
  /** The environment to change in place: the worker's process.env. */
  env: Record<string, string | undefined>;
  log: (message: string) => void;
}

export async function applyRunSpaceEnvironment(
  input: RunSpaceEnvironmentInput
): Promise<{ refusal?: string }> {
  const { context, environment, agentRefusal } = await input.resolveEnvironment(
    input.repositoryPath,
    input.agentType
  );
  input.log(`Space: ${context.space.name} (${context.source})`);
  if (agentRefusal) return { refusal: agentRefusal };

  const removed = environment.unset.filter((name) => input.env[name] !== undefined);
  for (const name of environment.unset) delete input.env[name];
  Object.assign(input.env, environment.set);

  const setNames = Object.keys(environment.set);
  if (setNames.length > 0) input.log(`Space environment: set ${setNames.join(', ')}`);
  if (removed.length > 0) input.log(`Space environment: removed host ${removed.join(', ')}`);
  return {};
}
