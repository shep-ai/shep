/**
 * Agent-Run Environment Marker
 *
 * A feature worker marks its environment with the run and feature it is
 * executing; every agent CLI it spawns — and every shell command that agent
 * runs — inherits the marker. It lets a `shep` command tell "a person at a
 * terminal" from "an agent inside a feature worktree", which matters for the
 * commands that would stop the agent that typed them: `shep stop`, `restart`
 * and `upgrade` stop the daemon that serves the UI and schedules every
 * feature, and `shep agent stop` on the caller's own run kills the caller.
 *
 * The decisions live here, not in the commands, so every surface refuses
 * identically. Relative imports inside `domain/` carry no file extension.
 */

/** Set on a feature worker's environment: the agent run it executes. */
export const AGENT_RUN_ID_ENV_VAR = 'SHEP_AGENT_RUN_ID';

/** Set on a feature worker's environment: the feature it works on. */
export const AGENT_FEATURE_ID_ENV_VAR = 'SHEP_FEATURE_ID';

/** The option that overrides a refusal, as the commands spell it. */
const FORCE_FLAG = '--force';

/** A process environment, e.g. `process.env`. */
export type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

/** The agent run a process is part of. */
export interface AgentRunEnvironment {
  runId: string;
  featureId?: string;
}

/** The variables a worker adds to its environment for its run. */
export function agentRunEnvironment(runId: string, featureId: string): Record<string, string> {
  return { [AGENT_RUN_ID_ENV_VAR]: runId, [AGENT_FEATURE_ID_ENV_VAR]: featureId };
}

/** The agent run this environment belongs to, or undefined outside any run. */
export function readAgentRunEnvironment(
  env: EnvironmentVariables
): AgentRunEnvironment | undefined {
  const runId = env[AGENT_RUN_ID_ENV_VAR];
  if (!runId) return undefined;
  const featureId = env[AGENT_FEATURE_ID_ENV_VAR];
  return featureId ? { runId, featureId } : { runId };
}

function describeRun(run: AgentRunEnvironment): string {
  return run.featureId ? `run ${run.runId} (feature ${run.featureId})` : `run ${run.runId}`;
}

/**
 * Should a command that stops or replaces the Shep daemon refuse?
 *
 * @returns The refusal to show, or undefined when the command may proceed.
 */
export function refuseHostShutdownFromAgent(
  env: EnvironmentVariables,
  force: boolean
): string | undefined {
  const run = readAgentRunEnvironment(env);
  if (!run || force) return undefined;
  return (
    `Refusing to stop the Shep daemon from inside Shep agent ${describeRun(run)}: ` +
    `it serves the UI and schedules every running feature, including this one. ` +
    `Finish the task instead; pass ${FORCE_FLAG} only if stopping Shep is the task.`
  );
}

/**
 * Should stopping this agent run refuse because the caller is part of it?
 *
 * A run of the caller's own feature counts as its own: a feature has one live
 * run, and it is the one executing the caller.
 *
 * @param overrideHint - How the caller overrides the refusal, when not `--force`.
 * @returns The refusal to show, or undefined when the stop may proceed.
 */
export function refuseStoppingOwnRun(
  env: EnvironmentVariables,
  target: { runId?: string; featureId?: string },
  force: boolean,
  overrideHint = `Pass ${FORCE_FLAG} to stop it anyway.`
): string | undefined {
  const run = readAgentRunEnvironment(env);
  if (!run || force) return undefined;
  const ownRun = target.runId === run.runId;
  const ownFeature = run.featureId !== undefined && target.featureId === run.featureId;
  if (!ownRun && !ownFeature) return undefined;
  return (
    `Refusing to stop Shep agent ${describeRun(run)} from inside itself — ` +
    `it would kill the agent running this command. ${overrideHint}`
  );
}
