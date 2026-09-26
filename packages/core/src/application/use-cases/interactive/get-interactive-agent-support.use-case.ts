/**
 * Get Interactive Agent Support Use Case
 *
 * Tells a chat surface whether an agent can run an interactive (chat)
 * session, so it can explain the problem up front instead of letting the
 * user's first message fail. Resolves the explicit agent, else the one in
 * settings; the answer comes from `IAgentExecutorFactory.supportsInteractive`,
 * so it changes automatically as agents gain interactive support.
 */

import { injectable, inject } from 'tsyringe';
import type { IAgentExecutorFactory } from '../../ports/output/agents/agent-executor-factory.interface.js';
import type { ISettingsProvider } from '../../ports/output/services/settings-provider.interface.js';
import type { AgentType } from '../../../domain/generated/output.js';
import { getAgentDescriptor } from '../../../domain/shared/agent-catalog.js';

export interface GetInteractiveAgentSupportInput {
  /** Agent pinned by the caller (e.g. `Application.agentType`). */
  agentType?: string;
}

export interface InteractiveAgentSupport {
  /** The agent that was checked. Absent when none could be resolved yet. */
  agentType?: string;
  /** Display label for `agentType`, for user-facing copy. */
  label?: string;
  /** False only when the agent is known to have no interactive mode. */
  supported: boolean;
}

@injectable()
export class GetInteractiveAgentSupportUseCase {
  constructor(
    @inject('IAgentExecutorFactory')
    private readonly executorFactory: IAgentExecutorFactory,
    @inject('ISettingsProvider')
    private readonly settingsProvider: ISettingsProvider
  ) {}

  async execute(input: GetInteractiveAgentSupportInput): Promise<InteractiveAgentSupport> {
    const agentType =
      input.agentType ??
      (this.settingsProvider.has() ? this.settingsProvider.get().agent.type : undefined);
    // Nothing to check yet: the session resolves its own default at boot.
    if (!agentType) return { supported: true };

    return {
      agentType,
      label: getAgentDescriptor(agentType)?.label ?? agentType,
      supported: this.executorFactory.supportsInteractive(agentType as AgentType),
    };
  }
}
