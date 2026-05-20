/**
 * AgentCliAvailabilityDiagnostic
 *
 * Reports whether at least one supported agent CLI (Claude Code, Cursor,
 * Gemini, Codex, Copilot) is authenticated. Shep needs at least one
 * available agent to drive any feature flow; this check warns rather than
 * fails so a contributor can still run `shep doctor` itself before signing
 * in to any provider.
 */

import { inject, injectable } from 'tsyringe';

import { AgentType, DiagnosticStatus } from '../../../../domain/generated/output.js';
import type {
  DiagnosticResult,
  IDiagnostic,
} from '../../../ports/output/services/diagnostic.interface.js';
import type { IAgentAuthDetectorService } from '../../../ports/output/services/agent-auth-detector.interface.js';

interface AgentProbe {
  type: AgentType;
  binary: string | null;
  label: string;
}

const AGENT_PROBES: readonly AgentProbe[] = [
  { type: AgentType.ClaudeCode, binary: null, label: 'Claude Code' },
  { type: AgentType.Cursor, binary: 'cursor', label: 'Cursor' },
  { type: AgentType.GeminiCli, binary: 'gemini', label: 'Gemini CLI' },
  { type: AgentType.CodexCli, binary: 'codex', label: 'Codex CLI' },
  { type: AgentType.CopilotCli, binary: 'gh', label: 'Copilot CLI' },
];

@injectable()
export class AgentCliAvailabilityDiagnostic implements IDiagnostic {
  readonly name = 'agent-cli-availability';

  constructor(
    @inject('IAgentAuthDetectorService')
    private readonly authDetector: IAgentAuthDetectorService
  ) {}

  async run(): Promise<DiagnosticResult> {
    const settled = await Promise.all(
      AGENT_PROBES.map(async (probe) => ({
        probe,
        ok: await this.authDetector.isAuthenticated(probe.type, probe.binary).catch(() => false),
      }))
    );
    const authed = settled.filter((s) => s.ok).map((s) => s.probe.label);
    if (authed.length === 0) {
      return {
        name: this.name,
        status: DiagnosticStatus.Warn,
        detail: 'No agent CLI is authenticated (Claude Code / Cursor / Gemini / Codex / Copilot)',
        fixHint: 'Sign in to at least one agent (e.g. `claude auth login` or `gh auth login`)',
      };
    }
    return {
      name: this.name,
      status: DiagnosticStatus.Ok,
      detail: `Authenticated agents: ${authed.join(', ')}`,
    };
  }
}
