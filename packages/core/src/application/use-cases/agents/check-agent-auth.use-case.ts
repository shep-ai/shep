/**
 * Check Agent Auth Use Case
 *
 * Reports the install + auth status of the currently selected AI coding
 * agent. Used by the onboarding empty state to drive the "Ready / Not
 * installed / Needs auth" checklist.
 *
 * Owns:
 *  - Reading the active agent type from settings
 *  - Mapping agent type → user-facing label, tool id, binary name
 *  - Looking up tool installation status via ListToolsUseCase
 *  - Delegating credential detection to IAgentAuthDetectorService
 *
 * Presentation-agnostic: callable from CLI, TUI, and Web identically.
 * The shape returned mirrors what the web UI consumes today; CLI/TUI may
 * project a subset.
 */

import { injectable, inject } from 'tsyringe';

import { AgentType } from '../../../domain/generated/output.js';
import { getSettings } from '../../../infrastructure/services/settings.service.js';
import type { IAgentAuthDetectorService } from '../../ports/output/services/agent-auth-detector.interface.js';
import { ListToolsUseCase } from '../tools/list-tools.use-case.js';

export interface CheckAgentAuthResult {
  /** Raw agent type string (matches AgentType enum values, or 'unknown'). */
  agentType: string;
  /** Whether the CLI tool binary is installed. */
  installed: boolean;
  /** Whether credentials / auth appear valid. */
  authenticated: boolean;
  /** Human-readable label for the agent (e.g. "Claude Code"). */
  label: string;
  /** CLI binary name (e.g. "claude", "gemini"). */
  binaryName: string | null;
  /** Shell command to install the tool, resolved for the current platform. */
  installCommand: string | null;
  /** Hint to show the user when not authenticated (typically the binary name). */
  authCommand: string | null;
}

interface AgentMetadata {
  label: string;
  /** Tool id from the tool installer JSON catalogue, or null if no tool. */
  toolId: string | null;
  /** Binary name on PATH, or null if no binary. */
  binaryName: string | null;
}

/**
 * Co-located metadata table — pure facts about each AgentType. Lives in
 * the use case because it is the only consumer that needs all three pieces
 * (label + tool id + binary) wired together.
 */
const AGENT_METADATA: Record<string, AgentMetadata> = {
  [AgentType.ClaudeCode]: {
    label: 'Claude Code',
    toolId: 'claude-code',
    binaryName: 'claude',
  },
  [AgentType.Cursor]: { label: 'Cursor Agent', toolId: 'cursor-cli', binaryName: 'cursor-agent' },
  [AgentType.GeminiCli]: { label: 'Gemini CLI', toolId: 'gemini-cli', binaryName: 'gemini' },
  [AgentType.CopilotCli]: { label: 'Copilot CLI', toolId: 'copilot-cli', binaryName: 'copilot' },
  [AgentType.Aider]: { label: 'Aider', toolId: null, binaryName: null },
  [AgentType.Continue]: { label: 'Continue', toolId: null, binaryName: null },
  [AgentType.Dev]: { label: 'Demo', toolId: null, binaryName: null },
};

const UNKNOWN_RESULT: CheckAgentAuthResult = {
  agentType: 'unknown',
  installed: false,
  authenticated: false,
  label: 'Unknown',
  binaryName: null,
  installCommand: null,
  authCommand: null,
};

@injectable()
export class CheckAgentAuthUseCase {
  constructor(
    @inject(ListToolsUseCase) private readonly listToolsUseCase: ListToolsUseCase,
    @inject('IAgentAuthDetectorService')
    private readonly authDetector: IAgentAuthDetectorService
  ) {}

  async execute(): Promise<CheckAgentAuthResult> {
    let agentType: string;
    try {
      agentType = getSettings().agent.type;
    } catch {
      return UNKNOWN_RESULT;
    }

    const metadata = AGENT_METADATA[agentType];
    if (!metadata) {
      return { ...UNKNOWN_RESULT, agentType };
    }

    // Agents with no associated tool (dev/demo, aider, continue) — assume ready.
    if (!metadata.toolId) {
      return {
        agentType,
        installed: true,
        authenticated: true,
        label: metadata.label,
        binaryName: metadata.binaryName,
        installCommand: null,
        authCommand: null,
      };
    }

    // Resolve installation status from the tool catalogue.
    let installed = false;
    let installCommand: string | null = null;
    try {
      const tools = await this.listToolsUseCase.execute();
      const tool = tools.find((t) => t.id === metadata.toolId);
      installed = tool?.status.status === 'available';
      installCommand = tool?.installCommand ?? null;
    } catch {
      installed = false;
    }

    if (!installed) {
      return {
        agentType,
        installed: false,
        authenticated: false,
        label: metadata.label,
        binaryName: metadata.binaryName,
        installCommand,
        authCommand: metadata.binaryName ? `Install ${metadata.label} first` : null,
      };
    }

    // Tool is installed — defer credential detection to the platform adapter.
    const authenticated = await this.authDetector.isAuthenticated(
      agentType as AgentType,
      metadata.binaryName
    );

    return {
      agentType,
      installed: true,
      authenticated,
      label: metadata.label,
      binaryName: metadata.binaryName,
      installCommand,
      authCommand: authenticated ? null : metadata.binaryName,
    };
  }
}
