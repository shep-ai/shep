/**
 * Mock Agent Executor Factory
 *
 * Returns MockAgentExecutorService for deterministic E2E test behavior.
 * Activated via SHEP_MOCK_EXECUTOR=1 environment variable.
 */

import type { AgentType, AgentConfig } from '../../../../../domain/generated/output.js';
import type { IAgentExecutor } from '../../../../../application/ports/output/agents/agent-executor.interface.js';
import type { IInteractiveAgentExecutor } from '../../../../../application/ports/output/agents/interactive-agent-executor.interface.js';
import type {
  IAgentExecutorFactory,
  AgentCliInfo,
  AgentModelListing,
} from '../../../../../application/ports/output/agents/agent-executor-factory.interface.js';
import { MockAgentExecutorService } from './mock-executor.service.js';

export class MockAgentExecutorFactory implements IAgentExecutorFactory {
  private readonly executor = new MockAgentExecutorService();

  createExecutor(_agentType: AgentType, _authConfig: AgentConfig): IAgentExecutor {
    return this.executor;
  }

  getSupportedAgents(): AgentType[] {
    return ['claude-code' as AgentType];
  }

  getCliInfo(): AgentCliInfo[] {
    return [];
  }

  getSupportedModels(_agentType: AgentType): string[] {
    return [];
  }

  async listAvailableModels(
    _agentType: AgentType,
    _authConfig?: AgentConfig
  ): Promise<AgentModelListing[]> {
    return [];
  }

  createInteractiveExecutor(
    _agentType: AgentType,
    _authConfig: AgentConfig
  ): IInteractiveAgentExecutor {
    throw new Error('Interactive sessions are not supported in mock executor');
  }

  supportsInteractive(_agentType: AgentType): boolean {
    return false;
  }
}
