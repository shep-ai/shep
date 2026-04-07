/**
 * Agent Auth Detector Service Interface
 *
 * Output port for detecting whether the user is authenticated with a given
 * AI coding agent (Claude Code, Cursor, Gemini CLI, Copilot CLI, etc.).
 *
 * Implementations are platform-specific: they may inspect environment
 * variables, credentials files, the macOS Keychain, or call agent-specific
 * `auth status` subcommands. Keeping this behind an output port keeps the
 * application layer free of node:fs / child_process / keychain imports and
 * lets tests substitute a fake.
 */

import type { AgentType } from '../../../../domain/generated/output.js';

export interface IAgentAuthDetectorService {
  /**
   * Returns true if the user appears to be authenticated with the given
   * agent. Implementations should be best-effort and conservative: prefer
   * fast heuristics (env vars, file existence) over slow subprocess calls,
   * and tolerate detection failures by returning false rather than throwing.
   */
  isAuthenticated(agentType: AgentType, binaryName: string | null): Promise<boolean>;
}
