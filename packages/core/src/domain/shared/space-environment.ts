/**
 * Space environment (spec 121): what a space's agent settings change in the
 * environment of the processes that work on its repositories.
 *
 * The result has two halves. `set` points tools at the space's own logins and
 * identity. `unset` removes host credentials that the tools would otherwise
 * prefer over those logins: Claude Code uses ANTHROPIC_API_KEY before anything
 * in CLAUDE_CONFIG_DIR, and gh uses GH_TOKEN before anything in GH_CONFIG_DIR,
 * so a space setting that only added variables would silently lose.
 *
 * Pure: no I/O, no process.env access. Per the domain/ convention, relative
 * imports carry no extension.
 */

import type { AgentType, SpaceAgentSettings } from '../generated/output';

export interface SpaceEnvironment {
  /** Variables to set, overriding the host. */
  set: Record<string, string>;
  /** Host variables to remove. */
  unset: string[];
}

/** Host credentials that take precedence over a Claude config directory. */
const CLAUDE_HOST_CREDENTIALS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
] as const;

/** Host credentials that take precedence over a gh config directory. */
const GITHUB_HOST_CREDENTIALS = [
  'GH_TOKEN',
  'GITHUB_TOKEN',
  'GH_ENTERPRISE_TOKEN',
  'GITHUB_ENTERPRISE_TOKEN',
] as const;

const BEDROCK_FLAG = 'CLAUDE_CODE_USE_BEDROCK';
const BEDROCK_ON = '1';

/** The environment change a space's agent settings call for; empty without settings. */
export function spaceEnvironment(settings: SpaceAgentSettings | undefined): SpaceEnvironment {
  const set: Record<string, string> = {};
  const unset: string[] = [];
  if (!settings) return { set, unset };

  if (settings.claudeConfigDir) {
    set.CLAUDE_CONFIG_DIR = settings.claudeConfigDir;
    unset.push(...CLAUDE_HOST_CREDENTIALS);
  }
  if (settings.ghConfigDir) {
    set.GH_CONFIG_DIR = settings.ghConfigDir;
    unset.push(...GITHUB_HOST_CREDENTIALS);
  }
  if (settings.gitAuthorName) {
    set.GIT_AUTHOR_NAME = settings.gitAuthorName;
    set.GIT_COMMITTER_NAME = settings.gitAuthorName;
  }
  if (settings.gitAuthorEmail) {
    set.GIT_AUTHOR_EMAIL = settings.gitAuthorEmail;
    set.GIT_COMMITTER_EMAIL = settings.gitAuthorEmail;
  }
  if (settings.useBedrock === true) set[BEDROCK_FLAG] = BEDROCK_ON;
  if (settings.useBedrock === false) unset.push(BEDROCK_FLAG);
  if (settings.awsProfile) set.AWS_PROFILE = settings.awsProfile;

  return { set, unset };
}

/** A copy of `base` with the space environment applied; `base` is not modified. */
export function applySpaceEnvironment<T extends Record<string, string | undefined>>(
  base: T,
  environment: SpaceEnvironment
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = { ...base };
  for (const name of environment.unset) delete result[name];
  return { ...result, ...environment.set };
}

/** Whether a space lets an agent type run; an empty or missing list allows every agent. */
export function isAgentAllowedInSpace(
  settings: SpaceAgentSettings | undefined,
  agentType: AgentType
): boolean {
  const allowed = settings?.allowedAgentTypes;
  return !allowed || allowed.length === 0 || allowed.includes(agentType);
}

/**
 * The agent a space-scoped run uses: the requested one when the space allows
 * it, the space's first allowed agent when none is requested, or the default
 * agent (no type) when the space allows every agent.
 */
export function spaceAgent(
  settings: SpaceAgentSettings | undefined,
  requested?: AgentType
): { ok: true; agentType?: AgentType } | { ok: false } {
  if (requested)
    return isAgentAllowedInSpace(settings, requested)
      ? { ok: true, agentType: requested }
      : { ok: false };
  const first = settings?.allowedAgentTypes?.[0];
  return first ? { ok: true, agentType: first } : { ok: true };
}
