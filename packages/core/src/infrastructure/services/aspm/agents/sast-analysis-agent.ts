/**
 * SAST analysis agent (Phase 11, task-71). Agent-driven static analysis over
 * source code, returning SARIF-equivalent FindingDraft[] for the orchestrator.
 */

import { FindingDomain } from '../../../../domain/generated/output';
import type { IAgentExecutorProvider } from '../../../../application/ports/output/agents/agent-executor-provider.interface';
import type {
  AgentAnalyzerRunInput,
  AgentAnalyzerRunResult,
  IAgentSecurityAnalyzer,
} from '../../../../application/ports/output/services/agent-security-analyzer-port.interface';
import { AgentSecurityAnalyzer } from './agent-security-analyzer';

const SAST_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.go',
  '.rs',
  '.rb',
  '.php',
  '.java',
  '.cs',
];

const SAST_PROMPT = `You are a Static Application Security Testing engine.
Analyze the provided source files and report concrete security defects only —
NOT style nits, NOT dead code, NOT performance hints.

Focus on the CWE Top 25: injection (SQL/command/template), missing auth checks,
hardcoded credentials, insecure deserialization, path traversal, SSRF, XXE,
crypto misuse, race conditions, log injection, and tainted-data flows.

Return strictly:
{
  "findings": [
    {
      "ruleId": "<short rule id, e.g. sql-injection-string-concat>",
      "title": "<short human title>",
      "description": "<1-3 sentences explaining the issue + remediation>",
      "severity": "Critical|High|Medium|Low|Info",
      "locationPath": "<file path>",
      "locationLine": <integer>,
      "cweId": "CWE-<number>",
      "owaspAsvsControlId": "<ASVS id, optional>"
    }
  ]
}

If no defects are found, return {"findings": []}. Never emit prose outside the JSON.`;

export class SastAnalysisAgent implements IAgentSecurityAnalyzer {
  private readonly analyzer: AgentSecurityAnalyzer;

  constructor(provider: IAgentExecutorProvider) {
    this.analyzer = new AgentSecurityAnalyzer(provider, {
      id: 'sast',
      sourceLabel: 'scan:sast',
      findingDomain: FindingDomain.Code,
      includes: (path) => SAST_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext)),
      systemPrompt: SAST_PROMPT,
    });
  }

  run(input: AgentAnalyzerRunInput): Promise<AgentAnalyzerRunResult> {
    return this.analyzer.run(input);
  }
}
