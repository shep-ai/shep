/**
 * IAgentSecurityAnalyzer (Phase 11) — single port the orchestrator uses to
 * invoke any of the three agent-driven scan stages. The infrastructure
 * adapters (SastAnalysisAgent / ContainerHardeningAgent / IacSecurityAgent)
 * all expose the same `run({ files }) → { drafts, failed, errorMessage? }`
 * contract, which is reflected here so the use case stays free of
 * infrastructure imports.
 */

import type { FindingDraft } from './finding-ingest-port.interface';
import type { ScanInputFile } from '../../../../domain/aspm/scan/scan-input';

export interface AgentAnalyzerRunInput {
  files: readonly ScanInputFile[];
  maxBytes?: number;
}

export interface AgentAnalyzerRunResult {
  drafts: FindingDraft[];
  failed: boolean;
  errorMessage?: string;
}

export interface IAgentSecurityAnalyzer {
  run(input: AgentAnalyzerRunInput): Promise<AgentAnalyzerRunResult>;
}
