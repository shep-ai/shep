/**
 * Shared base for the three agent-driven scan stages (Phase 11, task-71/72/73):
 * SAST, container hardening, IaC misconfiguration.
 *
 * Why one base: each analyzer differs only in (a) the prompt + (b) the file
 * filter. Everything else — provider resolution, JSON schema validation,
 * mapping back to FindingDraft, failure handling — is identical.
 *
 * Agent-agnostic by design: the analyzer resolves its executor via
 * IAgentExecutorProvider and NEVER imports a provider SDK directly (see
 * AGENTS.md). The JSON output schema is the contract; whichever provider
 * the user has configured is responsible for honoring it.
 */

import type { IAgentExecutorProvider } from '../../../../application/ports/output/agents/agent-executor-provider.interface';
import type { ScanInputFile } from '../../../../domain/aspm/scan/scan-input';
import type { FindingDraft } from '../../../../application/ports/output/services/finding-ingest-port.interface';
import type {
  AgentAnalyzerRunInput,
  AgentAnalyzerRunResult,
  IAgentSecurityAnalyzer,
} from '../../../../application/ports/output/services/agent-security-analyzer-port.interface';
import { CanonicalSeverity, type FindingDomain } from '../../../../domain/generated/output';

export type {
  AgentAnalyzerRunInput,
  AgentAnalyzerRunResult,
} from '../../../../application/ports/output/services/agent-security-analyzer-port.interface';

interface AgentFindingShape {
  ruleId: string;
  title: string;
  description: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  locationPath?: string;
  locationLine?: number;
  cweId?: string;
  owaspAsvsControlId?: string;
}

const SEVERITY_MAP: Record<AgentFindingShape['severity'], CanonicalSeverity> = {
  Critical: CanonicalSeverity.Critical,
  High: CanonicalSeverity.High,
  Medium: CanonicalSeverity.Medium,
  Low: CanonicalSeverity.Low,
  Info: CanonicalSeverity.Info,
};

const FINDINGS_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['findings'],
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['ruleId', 'title', 'description', 'severity'],
        properties: {
          ruleId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          severity: { type: 'string', enum: ['Critical', 'High', 'Medium', 'Low', 'Info'] },
          locationPath: { type: 'string' },
          locationLine: { type: 'integer' },
          cweId: { type: 'string' },
          owaspAsvsControlId: { type: 'string' },
        },
      },
    },
  },
} as const;

export interface AgentAnalyzerConfig {
  /** Stable analyzer id used for source labels + rule prefixes. */
  id: string;
  /** Source label written to every emitted FindingDraft (e.g. `scan:sast`). */
  sourceLabel: string;
  /** Finding domain emitted on every draft (Sast / Container / Iac). */
  findingDomain: FindingDomain;
  /** Per-file include filter — only matching files are sent to the agent. */
  includes: (path: string) => boolean;
  /** Domain-specific system prompt prepended to the input bundle. */
  systemPrompt: string;
}

export class AgentSecurityAnalyzer implements IAgentSecurityAnalyzer {
  constructor(
    private readonly provider: IAgentExecutorProvider,
    private readonly config: AgentAnalyzerConfig
  ) {}

  async run(input: AgentAnalyzerRunInput): Promise<AgentAnalyzerRunResult> {
    const eligibleFiles = input.files.filter((f) => this.config.includes(f.path));
    if (eligibleFiles.length === 0) {
      return { drafts: [], failed: false };
    }

    const bundle = bundleFiles(eligibleFiles, input.maxBytes ?? 200_000);
    const prompt = `${this.config.systemPrompt}\n\nFiles:\n${bundle}`;

    try {
      const executor = await this.provider.getExecutor();
      const result = await executor.execute(prompt, {
        outputSchema: FINDINGS_OUTPUT_SCHEMA,
        silent: true,
      });
      const drafts = this.parseFindings(result.result);
      return { drafts, failed: false };
    } catch (err) {
      return {
        drafts: [],
        failed: true,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private parseFindings(raw: string): FindingDraft[] {
    let parsed: { findings?: AgentFindingShape[] };
    try {
      parsed = JSON.parse(raw) as { findings?: AgentFindingShape[] };
    } catch {
      // Most agent providers return prose around the JSON; try to extract the
      // first { ... } block.
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return [];
      try {
        parsed = JSON.parse(match[0]) as { findings?: AgentFindingShape[] };
      } catch {
        return [];
      }
    }
    const items = parsed.findings ?? [];
    const drafts: FindingDraft[] = [];
    for (const item of items) {
      const canonical = SEVERITY_MAP[item.severity];
      if (!canonical) continue;
      drafts.push({
        ruleId: `${this.config.id}.${item.ruleId}`,
        title: item.title,
        description: item.description,
        findingDomain: this.config.findingDomain,
        locationPath: item.locationPath,
        locationLine: item.locationLine,
        rawSeverity: item.severity,
        canonicalSeverity: canonical,
        cweId: item.cweId,
        owaspAsvsControlId: item.owaspAsvsControlId,
        source: this.config.sourceLabel,
      });
    }
    return drafts;
  }
}

function bundleFiles(files: readonly ScanInputFile[], maxBytes: number): string {
  let total = 0;
  const parts: string[] = [];
  for (const file of files) {
    const block = `--- ${file.path} ---\n${file.content}\n`;
    if (total + block.length > maxBytes) break;
    parts.push(block);
    total += block.length;
  }
  return parts.join('\n');
}
