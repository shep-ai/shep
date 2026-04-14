/**
 * Agent Validator Service
 *
 * Infrastructure implementation of the IAgentValidator port.
 * Checks if AI agent binaries are available on the system by
 * executing `<binary> --version` via subprocess.
 *
 * Uses constructor dependency injection for the command executor
 * to enable testability without mocking node:child_process directly.
 */

import { injectable, inject } from 'tsyringe';

import type { AgentType } from '../../../../domain/generated/output.js';
import type {
  IAgentValidator,
  AgentValidationResult,
} from '../../../../application/ports/output/agents/agent-validator.interface.js';

import type { ExecFunction } from './types.js';

/**
 * Map of supported agent types to their binary command names.
 */
const AGENT_BINARY_MAP: Partial<Record<AgentType, string>> = {
  'claude-code': 'claude',
  'codex-cli': 'codex',
  'copilot-cli': 'copilot',
  cursor: 'cursor-agent',
  'gemini-cli': 'gemini',
  cline: 'cline',
};

/**
 * Service that validates agent tool availability on the system.
 *
 * Checks if the agent binary exists and is executable by running
 * `<binary> --version` and parsing the output.
 */
@injectable()
export class AgentValidatorService implements IAgentValidator {
  private readonly execFn: ExecFunction;

  /**
   * @param execFn - Command executor function (injectable for testing).
   *   Uses execFile semantics (no shell) to prevent command injection.
   */
  constructor(@inject('ExecFunction') execFn: ExecFunction) {
    this.execFn = execFn;
  }

  /**
   * Check if the specified agent tool is available on the system.
   *
   * @param agentType - The agent type to check
   * @returns Validation result with availability status and version
   */
  async isAvailable(agentType: AgentType): Promise<AgentValidationResult> {
    // Dev type requires no binary — always available for local development
    if (agentType === 'dev') return { available: true, version: 'dev' };

    // SDK-based agents require no binary — always available (auth checked at execution time)
    if (agentType === 'openrouter' || agentType === 'together-ai' || agentType === 'ollama') {
      return { available: true, version: 'sdk' };
    }

    const binary = AGENT_BINARY_MAP[agentType];

    if (!binary) {
      return {
        available: false,
        error: `Agent type "${agentType}" is not supported yet`,
      };
    }

    try {
      const { stdout } = await this.execFn(binary, ['--version']);
      const version = stdout.trim();

      return {
        available: true,
        version,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      return {
        available: false,
        error: `Binary "${binary}" not found or not executable: ${message}`,
      };
    }
  }
}
