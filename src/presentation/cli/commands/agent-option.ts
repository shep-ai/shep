/** Parsing `--agent` style options: only agent types shep can run are accepted. */

import { InvalidArgumentError } from 'commander';
import type { AgentType } from '@/domain/generated/output.js';
import { isSupportedAgentType, listSupportedAgentTypes } from '@/domain/shared/agent-catalog.js';
import { getCliI18n } from '../i18n.js';

export function parseAgentType(value: string): AgentType {
  const agent = value.trim();
  if (!isSupportedAgentType(agent)) {
    throw new InvalidArgumentError(
      getCliI18n().t('cli:commands.agentOption.unknown', {
        value: agent,
        supported: listSupportedAgentTypes().join(', '),
      })
    );
  }
  return agent as AgentType;
}

/** A comma-separated list of agent types. */
export function parseAgentTypeList(value: string): AgentType[] {
  return value
    .split(',')
    .map((agent) => agent.trim())
    .filter(Boolean)
    .map(parseAgentType);
}
