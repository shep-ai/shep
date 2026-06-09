/**
 * ASPM (Application Security Posture Management) registrations.
 *
 * Feature 098. Invoked from `container.ts` after the existing `register-*`
 * modules and after migrations run. Each phase adds bindings in this file
 * in dependency order so the DI graph mirrors the layered architecture.
 *
 * Phase 2 (Asset & Ownership Model) registers:
 *
 *   Repositories — Owner / Team / BusinessUnit / Service / ApiAsset /
 *                  CloudEnvironment
 *   Services     — IOwnershipYamlReader
 *   Use cases    — ListOwners / AssignOwner / ImportOwnershipYaml /
 *                  ResolveOwnershipForFinding
 *
 * Tokens live in `./aspm-tokens.ts` — never inline string literals at the
 * call site (.claude/rules/code-quality.md — No Magic Values).
 */
import type Database from 'better-sqlite3';
import type { DependencyContainer } from 'tsyringe';

import { ASPM_TOKENS } from './aspm-tokens.js';

// Repository ports
import type { IApiAssetRepository } from '../../../application/ports/output/repositories/api-asset-repository.interface.js';
import type { IBusinessUnitRepository } from '../../../application/ports/output/repositories/business-unit-repository.interface.js';
import type { ICloudEnvironmentRepository } from '../../../application/ports/output/repositories/cloud-environment-repository.interface.js';
import type { IFindingRepository } from '../../../application/ports/output/repositories/finding-repository.interface.js';
import type { IOwnerRepository } from '../../../application/ports/output/repositories/owner-repository.interface.js';
import type { IRemediationCampaignRepository } from '../../../application/ports/output/repositories/remediation-campaign-repository.interface.js';
import type { IRiskExceptionRepository } from '../../../application/ports/output/repositories/risk-exception-repository.interface.js';
import type { IRiskScoreRepository } from '../../../application/ports/output/repositories/risk-score-repository.interface.js';
import type { ISecurityPolicyRepository } from '../../../application/ports/output/repositories/security-policy-repository.interface.js';
import type { IServiceRepository } from '../../../application/ports/output/repositories/service-repository.interface.js';
import type { ITeamRepository } from '../../../application/ports/output/repositories/team-repository.interface.js';

import type { IAiChangeRiskSignalRepository } from '../../../application/ports/output/repositories/ai-change-risk-signal-repository.interface.js';
import type { IComplianceControlRepository } from '../../../application/ports/output/repositories/compliance-control-repository.interface.js';
import type { IScanRunRepository } from '../../../application/ports/output/repositories/scan-run-repository.interface.js';

// Service ports
import type { IExploitIntelPort } from '../../../application/ports/output/services/exploit-intel-port.interface.js';
import type { IFindingIngestPort } from '../../../application/ports/output/services/finding-ingest-port.interface.js';
import type { IOwnershipYamlReader } from '../../../application/ports/output/services/ownership-yaml-reader.interface.js';
import type { ISbomPort } from '../../../application/ports/output/services/sbom-port.interface.js';
import type { ISlaClockPort } from '../../../application/ports/output/services/sla-clock-port.interface.js';
import type { IOsvVulnerabilityPort } from '../../../application/ports/output/services/osv-vulnerability-port.interface.js';
import type { IGitOwnershipPort } from '../../../application/ports/output/services/git-ownership-port.interface.js';
import type { IFileTreeReaderPort } from '../../../application/ports/output/services/file-tree-reader-port.interface.js';
import type { IAgentSecurityAnalyzer } from '../../../application/ports/output/services/agent-security-analyzer-port.interface.js';
import type { IAgentExecutorProvider } from '../../../application/ports/output/agents/agent-executor-provider.interface.js';

// Concrete repositories
import { SQLiteApiAssetRepository } from '../../repositories/aspm/sqlite-api-asset-repository.js';
import { SQLiteBusinessUnitRepository } from '../../repositories/aspm/sqlite-business-unit-repository.js';
import { SQLiteCloudEnvironmentRepository } from '../../repositories/aspm/sqlite-cloud-environment-repository.js';
import { SQLiteFindingRepository } from '../../repositories/aspm/sqlite-finding-repository.js';
import { SQLiteOwnerRepository } from '../../repositories/aspm/sqlite-owner-repository.js';
import { SQLiteRemediationCampaignRepository } from '../../repositories/aspm/sqlite-remediation-campaign-repository.js';
import { SQLiteRiskExceptionRepository } from '../../repositories/aspm/sqlite-risk-exception-repository.js';
import { SQLiteRiskScoreRepository } from '../../repositories/aspm/sqlite-risk-score-repository.js';
import { SQLiteSecurityPolicyRepository } from '../../repositories/aspm/sqlite-security-policy-repository.js';
import { SQLiteServiceRepository } from '../../repositories/aspm/sqlite-service-repository.js';
import { SQLiteTeamRepository } from '../../repositories/aspm/sqlite-team-repository.js';
import { SQLiteAiChangeRiskSignalRepository } from '../../repositories/aspm/sqlite-ai-change-risk-signal-repository.js';
import { SQLiteComplianceControlRepository } from '../../repositories/aspm/sqlite-compliance-control-repository.js';
import { SQLiteScanRunRepository } from '../../repositories/aspm/sqlite-scan-run-repository.js';

// Concrete services
import { CycloneDxSbomAdapter } from '../../services/aspm/cyclonedx-sbom-adapter.js';
import { ExploitIntelAdapter } from '../../services/aspm/exploit-intel-adapter.js';
import { OwnershipYamlReader } from '../../services/aspm/ownership-yaml-reader.js';
import { SarifIngestAdapter } from '../../services/aspm/sarif-ingest-adapter.js';
import { SystemSlaClock } from '../../services/aspm/system-sla-clock.js';
import { NoOpAiChangeRiskSignalRepository } from '../../services/aspm/noop-ai-change-risk-signal-repository.js';
import { OsvVulnerabilityAdapter } from '../../services/aspm/osv-vulnerability-adapter.js';
import { GitOwnershipAdapter } from '../../services/aspm/git-ownership-adapter.js';
import { FileTreeReader } from '../../services/aspm/file-tree-reader.js';
import { SastAnalysisAgent } from '../../services/aspm/agents/sast-analysis-agent.js';
import { ContainerHardeningAgent } from '../../services/aspm/agents/container-hardening-agent.js';
import { IacSecurityAgent } from '../../services/aspm/agents/iac-security-agent.js';
import { join } from 'node:path';

// Phase 11 use cases
import { ScanApplicationUseCase } from '../../../application/use-cases/aspm/scan/scan-application.js';
import { RescanApplicationUseCase } from '../../../application/use-cases/aspm/scan/rescan-application.js';
import { ListScanRunsUseCase } from '../../../application/use-cases/aspm/scan/list-scan-runs.js';
import { GetScanRunUseCase } from '../../../application/use-cases/aspm/scan/get-scan-run.js';
import { ListScanTargetsUseCase } from '../../../application/use-cases/aspm/scan/list-scan-targets.js';

// Use cases
import { AssignOwnerUseCase } from '../../../application/use-cases/aspm/ownership/assign-owner.js';
import { ImportOwnershipYamlUseCase } from '../../../application/use-cases/aspm/ownership/import-ownership-yaml.js';
import { ListOwnerRollupsUseCase } from '../../../application/use-cases/aspm/ownership/list-owner-rollups.js';
import { ListOwnersUseCase } from '../../../application/use-cases/aspm/ownership/list-owners.js';
import { ResolveOwnershipForFindingUseCase } from '../../../application/use-cases/aspm/ownership/resolve-ownership-for-finding.js';
import { CloseCampaignUseCase } from '../../../application/use-cases/aspm/campaigns/close-campaign.js';
import { CreateCampaignUseCase } from '../../../application/use-cases/aspm/campaigns/create-campaign.js';
import { GetCampaignProgressUseCase } from '../../../application/use-cases/aspm/campaigns/get-campaign-progress.js';
import { ListCampaignsUseCase } from '../../../application/use-cases/aspm/campaigns/list-campaigns.js';
import { UpdateCampaignUseCase } from '../../../application/use-cases/aspm/campaigns/update-campaign.js';
import { DeclareExceptionUseCase } from '../../../application/use-cases/aspm/exceptions/declare-exception.js';
import { ListExpiringExceptionsUseCase } from '../../../application/use-cases/aspm/exceptions/list-expiring-exceptions.js';
import { RevokeExceptionUseCase } from '../../../application/use-cases/aspm/exceptions/revoke-exception.js';
import { ComputeRiskScoreForFindingUseCase } from '../../../application/use-cases/aspm/findings/compute-risk-score-for-finding.js';
import { GetFindingUseCase } from '../../../application/use-cases/aspm/findings/get-finding.js';
import { IngestFindingsUseCase } from '../../../application/use-cases/aspm/findings/ingest-findings.js';
import { IngestSbomUseCase } from '../../../application/use-cases/aspm/findings/ingest-sbom.js';
import { ListFindingsUseCase } from '../../../application/use-cases/aspm/findings/list-findings.js';
import { RankFindingsUseCase } from '../../../application/use-cases/aspm/findings/rank-findings.js';
import { RecomputeAllRiskScoresUseCase } from '../../../application/use-cases/aspm/findings/recompute-all-risk-scores.js';
import { BulkConvertFindingsUseCase } from '../../../application/use-cases/aspm/findings/bulk-convert-findings.js';
import { ConvertFindingToWorkItemUseCase } from '../../../application/use-cases/aspm/findings/convert-finding-to-work-item.js';
import { GetApplicationPostureUseCase } from '../../../application/use-cases/aspm/posture/get-application-posture.js';
import { ListInventoryPostureUseCase } from '../../../application/use-cases/aspm/posture/list-inventory-posture.js';
import { GetPostureSummaryUseCase } from '../../../application/use-cases/aspm/posture/get-posture-summary.js';
import { GetRiskTrendUseCase } from '../../../application/use-cases/aspm/posture/get-risk-trend.js';
import { DismissAiSignalUseCase } from '../../../application/use-cases/aspm/ai-review/dismiss-ai-signal.js';
import { GraduateAiSignalToFindingUseCase } from '../../../application/use-cases/aspm/ai-review/graduate-ai-signal-to-finding.js';
import { ListAiSignalsUseCase } from '../../../application/use-cases/aspm/ai-review/list-ai-signals.js';
import { RecordAiChangeRiskSignalUseCase } from '../../../application/use-cases/aspm/ai-review/record-ai-change-risk-signal.js';
import { GetComplianceCoverageUseCase } from '../../../application/use-cases/aspm/compliance/get-compliance-coverage.js';

/**
 * Register ASPM repositories, ports, services, and use cases on the
 * tsyringe container. Touching this file is MANDATORY when adding any
 * ASPM infrastructure binding.
 */
export function registerAspm(container: DependencyContainer): void {
  // Phase 2 — Asset & Ownership Model
  registerPhase2Repositories(container);
  registerPhase2Services(container);
  registerPhase2UseCases(container);

  // Phase 3 — SecurityFinding Entity + SARIF Ingestion
  registerPhase3Repositories(container);
  registerPhase3Services(container);
  registerPhase3UseCases(container);

  // Phase 4 — SBOM Ingestion + Exploit Intelligence
  registerPhase4Services(container);
  registerPhase4UseCases(container);

  // Phase 5 — Risk Scoring & Prioritization
  registerPhase5Repositories(container);
  registerPhase5UseCases(container);

  // Phase 6 — SLA, Remediation Campaigns & Risk Exceptions
  registerPhase6Repositories(container);
  registerPhase6Services(container);
  registerPhase6UseCases(container);

  // Phase 7 — Executive Dashboards & Developer Task Routing
  registerPhase7Repositories(container);
  registerPhase7UseCases(container);

  // Phase 8 — AI-Change Review Queue (overrides the phase-7 NoOp binding)
  registerPhase8Repositories(container);
  registerPhase8UseCases(container);

  // Phase 9 — Compliance Surface
  registerPhase9Repositories(container);
  registerPhase9UseCases(container);

  // Phase 11 — Native Scanning (replaces upload-driven ingest)
  registerPhase11Repositories(container);
  registerPhase11Services(container);
  registerPhase11UseCases(container);

  // String-token aliases so web pages can resolve via type-only imports
  // (matches the project convention used by register-use-cases.ts and avoids
  // pulling use-case source through Next.js webpack/turbopack bundling).
  registerStringTokenAliases(container);

  // Phases 9-10 attach below as they land:
  //
  //   - Phase 3: SecurityFinding repository + IFindingIngestPort (SARIF).
  //   - Phase 4: ISbomPort (CycloneDX) + IExploitIntelPort (KEV+EPSS).
  //   - Phase 5: RiskScore repository + scoring use cases.
  //   - Phase 6: SecurityPolicy / RemediationCampaign / RiskException
  //              + ISlaClockPort.
  //   - Phase 7: Posture/trend/application-posture + finding→work-item
  //              use cases + SSE wiring.
  //   - Phase 8: AiChangeRiskSignal repository + AI-review use cases.
  //   - Phase 9: ComplianceControl repository + coverage use case.
  //   - Phase 10: CLI + final web wiring (no new container bindings).

  // Keep the token import live so future maintainers can `Cmd-Click` into
  // `aspm-tokens.ts` from this module — and so a typo in token names
  // surfaces here, not in a far-away use case constructor.
  void ASPM_TOKENS;
}

function registerPhase2Repositories(container: DependencyContainer): void {
  container.register<IOwnerRepository>(ASPM_TOKENS.IOwnerRepository, {
    useFactory: (c) => new SQLiteOwnerRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<ITeamRepository>(ASPM_TOKENS.ITeamRepository, {
    useFactory: (c) => new SQLiteTeamRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IBusinessUnitRepository>(ASPM_TOKENS.IBusinessUnitRepository, {
    useFactory: (c) => new SQLiteBusinessUnitRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IServiceRepository>(ASPM_TOKENS.IServiceRepository, {
    useFactory: (c) => new SQLiteServiceRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IApiAssetRepository>(ASPM_TOKENS.IApiAssetRepository, {
    useFactory: (c) => new SQLiteApiAssetRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<ICloudEnvironmentRepository>(ASPM_TOKENS.ICloudEnvironmentRepository, {
    useFactory: (c) =>
      new SQLiteCloudEnvironmentRepository(c.resolve<Database.Database>('Database')),
  });
}

function registerPhase2Services(container: DependencyContainer): void {
  container.register<IOwnershipYamlReader>(ASPM_TOKENS.IOwnershipYamlReader, {
    useClass: OwnershipYamlReader,
  });
}

function registerPhase2UseCases(container: DependencyContainer): void {
  container.register(ListOwnersUseCase, { useClass: ListOwnersUseCase });
  container.register(AssignOwnerUseCase, { useClass: AssignOwnerUseCase });
  container.register(ImportOwnershipYamlUseCase, { useClass: ImportOwnershipYamlUseCase });
  container.register(ResolveOwnershipForFindingUseCase, {
    useClass: ResolveOwnershipForFindingUseCase,
  });
}

function registerPhase3Repositories(container: DependencyContainer): void {
  container.register<IFindingRepository>(ASPM_TOKENS.IFindingRepository, {
    useFactory: (c) => new SQLiteFindingRepository(c.resolve<Database.Database>('Database')),
  });
}

function registerPhase3Services(container: DependencyContainer): void {
  container.register<IFindingIngestPort>(ASPM_TOKENS.IFindingIngestPort, {
    useClass: SarifIngestAdapter,
  });
}

function registerPhase3UseCases(container: DependencyContainer): void {
  container.register(IngestFindingsUseCase, { useClass: IngestFindingsUseCase });
  container.register(ListFindingsUseCase, { useClass: ListFindingsUseCase });
  container.register(GetFindingUseCase, { useClass: GetFindingUseCase });
}

function registerPhase4Services(container: DependencyContainer): void {
  container.register<ISbomPort>(ASPM_TOKENS.ISbomPort, {
    useClass: CycloneDxSbomAdapter,
  });
  // ExploitIntelAdapter is intentionally not @injectable() — see the class
  // docstring. Register via factory so the production default cache dir and
  // live `fetch` are bound at resolve-time.
  container.register<IExploitIntelPort>(ASPM_TOKENS.IExploitIntelPort, {
    useFactory: () => new ExploitIntelAdapter(),
  });
}

function registerPhase4UseCases(container: DependencyContainer): void {
  container.register(IngestSbomUseCase, { useClass: IngestSbomUseCase });
}

function registerPhase5Repositories(container: DependencyContainer): void {
  container.register<IRiskScoreRepository>(ASPM_TOKENS.IRiskScoreRepository, {
    useFactory: (c) => new SQLiteRiskScoreRepository(c.resolve<Database.Database>('Database')),
  });
}

function registerPhase5UseCases(container: DependencyContainer): void {
  container.register(ComputeRiskScoreForFindingUseCase, {
    useClass: ComputeRiskScoreForFindingUseCase,
  });
  container.register(RecomputeAllRiskScoresUseCase, {
    useClass: RecomputeAllRiskScoresUseCase,
  });
  container.register(RankFindingsUseCase, { useClass: RankFindingsUseCase });
}

function registerPhase6Repositories(container: DependencyContainer): void {
  container.register<ISecurityPolicyRepository>(ASPM_TOKENS.ISecurityPolicyRepository, {
    useFactory: (c) => new SQLiteSecurityPolicyRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IRiskExceptionRepository>(ASPM_TOKENS.IRiskExceptionRepository, {
    useFactory: (c) => new SQLiteRiskExceptionRepository(c.resolve<Database.Database>('Database')),
  });
  container.register<IRemediationCampaignRepository>(ASPM_TOKENS.IRemediationCampaignRepository, {
    useFactory: (c) =>
      new SQLiteRemediationCampaignRepository(c.resolve<Database.Database>('Database')),
  });
}

function registerPhase6Services(container: DependencyContainer): void {
  // SystemSlaClock has no constructor params and is intentionally not
  // decorated — register via factory so tests can `container.registerInstance`
  // a fake clock without fighting tsyringe metadata.
  container.register<ISlaClockPort>(ASPM_TOKENS.ISlaClockPort, {
    useFactory: () => new SystemSlaClock(),
  });
}

function registerPhase6UseCases(container: DependencyContainer): void {
  container.register(DeclareExceptionUseCase, { useClass: DeclareExceptionUseCase });
  container.register(RevokeExceptionUseCase, { useClass: RevokeExceptionUseCase });
  container.register(ListExpiringExceptionsUseCase, { useClass: ListExpiringExceptionsUseCase });

  container.register(CreateCampaignUseCase, { useClass: CreateCampaignUseCase });
  container.register(UpdateCampaignUseCase, { useClass: UpdateCampaignUseCase });
  container.register(CloseCampaignUseCase, { useClass: CloseCampaignUseCase });
  container.register(ListCampaignsUseCase, { useClass: ListCampaignsUseCase });
  container.register(GetCampaignProgressUseCase, { useClass: GetCampaignProgressUseCase });
}

function registerPhase7Repositories(container: DependencyContainer): void {
  // Default to a NoOp AI-signal repo so the dashboard tile renders before
  // phase 8 wires the real SQLite implementation. tsyringe's
  // `register` overrides on subsequent calls — phase 8 simply re-registers
  // this token with the real repo class.
  container.register<IAiChangeRiskSignalRepository>(ASPM_TOKENS.IAiChangeRiskSignalRepository, {
    useClass: NoOpAiChangeRiskSignalRepository,
  });
}

function registerPhase7UseCases(container: DependencyContainer): void {
  container.register(GetPostureSummaryUseCase, { useClass: GetPostureSummaryUseCase });
  container.register(GetRiskTrendUseCase, { useClass: GetRiskTrendUseCase });
  container.register(GetApplicationPostureUseCase, { useClass: GetApplicationPostureUseCase });
  container.register(ListInventoryPostureUseCase, { useClass: ListInventoryPostureUseCase });
  container.register(ConvertFindingToWorkItemUseCase, {
    useClass: ConvertFindingToWorkItemUseCase,
  });
  container.register(BulkConvertFindingsUseCase, { useClass: BulkConvertFindingsUseCase });
  container.register(ListOwnerRollupsUseCase, { useClass: ListOwnerRollupsUseCase });
}

function registerPhase8Repositories(container: DependencyContainer): void {
  // Override the phase-7 NoOp default with the real SQLite implementation
  // backed by migration 114. tsyringe's `register` honors the most recent
  // call for a given token.
  container.register<IAiChangeRiskSignalRepository>(ASPM_TOKENS.IAiChangeRiskSignalRepository, {
    useFactory: (c) =>
      new SQLiteAiChangeRiskSignalRepository(c.resolve<Database.Database>('Database')),
  });
}

function registerPhase8UseCases(container: DependencyContainer): void {
  container.register(RecordAiChangeRiskSignalUseCase, {
    useClass: RecordAiChangeRiskSignalUseCase,
  });
  container.register(GraduateAiSignalToFindingUseCase, {
    useClass: GraduateAiSignalToFindingUseCase,
  });
  container.register(DismissAiSignalUseCase, { useClass: DismissAiSignalUseCase });
  container.register(ListAiSignalsUseCase, { useClass: ListAiSignalsUseCase });
}

function registerPhase9Repositories(container: DependencyContainer): void {
  container.register<IComplianceControlRepository>(ASPM_TOKENS.IComplianceControlRepository, {
    useFactory: (c) =>
      new SQLiteComplianceControlRepository(c.resolve<Database.Database>('Database')),
  });
}

function registerPhase9UseCases(container: DependencyContainer): void {
  container.register(GetComplianceCoverageUseCase, {
    useClass: GetComplianceCoverageUseCase,
  });
}

function registerPhase11Repositories(container: DependencyContainer): void {
  container.register<IScanRunRepository>(ASPM_TOKENS.IScanRunRepository, {
    useFactory: (c) => new SQLiteScanRunRepository(c.resolve<Database.Database>('Database')),
  });
}

function defaultOsvCacheDir(): string {
  const home = process.env.SHEP_HOME ?? join(process.env.HOME ?? '.', '.shep');
  return join(home, 'cache', 'osv');
}

function registerPhase11Services(container: DependencyContainer): void {
  container.register<IOsvVulnerabilityPort>(ASPM_TOKENS.IOsvVulnerabilityPort, {
    useFactory: () =>
      new OsvVulnerabilityAdapter({
        fetch: globalThis.fetch.bind(globalThis),
        cacheDir: defaultOsvCacheDir(),
      }),
  });
  container.register<IGitOwnershipPort>(ASPM_TOKENS.IGitOwnershipPort, {
    useFactory: () => new GitOwnershipAdapter(),
  });
  container.register<IFileTreeReaderPort>(ASPM_TOKENS.IFileTreeReaderPort, {
    useFactory: () => new FileTreeReader(),
  });
  container.register<IAgentSecurityAnalyzer>(ASPM_TOKENS.ISastAnalyzer, {
    useFactory: (c) =>
      new SastAnalysisAgent(c.resolve<IAgentExecutorProvider>('IAgentExecutorProvider')),
  });
  container.register<IAgentSecurityAnalyzer>(ASPM_TOKENS.IContainerHardeningAnalyzer, {
    useFactory: (c) =>
      new ContainerHardeningAgent(c.resolve<IAgentExecutorProvider>('IAgentExecutorProvider')),
  });
  container.register<IAgentSecurityAnalyzer>(ASPM_TOKENS.IIacSecurityAnalyzer, {
    useFactory: (c) =>
      new IacSecurityAgent(c.resolve<IAgentExecutorProvider>('IAgentExecutorProvider')),
  });
}

function registerPhase11UseCases(container: DependencyContainer): void {
  container.register(ScanApplicationUseCase, { useClass: ScanApplicationUseCase });
  container.register(RescanApplicationUseCase, { useClass: RescanApplicationUseCase });
  container.register(ListScanRunsUseCase, { useClass: ListScanRunsUseCase });
  container.register(GetScanRunUseCase, { useClass: GetScanRunUseCase });
  container.register(ListScanTargetsUseCase, { useClass: ListScanTargetsUseCase });
}

function registerStringTokenAliases(container: DependencyContainer): void {
  container.register('GetPostureSummaryUseCase', {
    useFactory: (c) => c.resolve(GetPostureSummaryUseCase),
  });
  container.register('GetRiskTrendUseCase', {
    useFactory: (c) => c.resolve(GetRiskTrendUseCase),
  });
  container.register('GetApplicationPostureUseCase', {
    useFactory: (c) => c.resolve(GetApplicationPostureUseCase),
  });
  container.register('ListInventoryPostureUseCase', {
    useFactory: (c) => c.resolve(ListInventoryPostureUseCase),
  });
  container.register('RankFindingsUseCase', {
    useFactory: (c) => c.resolve(RankFindingsUseCase),
  });
  container.register('GetFindingUseCase', {
    useFactory: (c) => c.resolve(GetFindingUseCase),
  });
  container.register('ComputeRiskScoreForFindingUseCase', {
    useFactory: (c) => c.resolve(ComputeRiskScoreForFindingUseCase),
  });
  container.register('ListFindingsUseCase', {
    useFactory: (c) => c.resolve(ListFindingsUseCase),
  });
  container.register('ListOwnerRollupsUseCase', {
    useFactory: (c) => c.resolve(ListOwnerRollupsUseCase),
  });
  container.register('ListAiSignalsUseCase', {
    useFactory: (c) => c.resolve(ListAiSignalsUseCase),
  });
  container.register('GetComplianceCoverageUseCase', {
    useFactory: (c) => c.resolve(GetComplianceCoverageUseCase),
  });
  container.register('DeclareExceptionUseCase', {
    useFactory: (c) => c.resolve(DeclareExceptionUseCase),
  });
  container.register('RevokeExceptionUseCase', {
    useFactory: (c) => c.resolve(RevokeExceptionUseCase),
  });
  container.register('ConvertFindingToWorkItemUseCase', {
    useFactory: (c) => c.resolve(ConvertFindingToWorkItemUseCase),
  });
  container.register('GraduateAiSignalToFindingUseCase', {
    useFactory: (c) => c.resolve(GraduateAiSignalToFindingUseCase),
  });
  container.register('DismissAiSignalUseCase', {
    useFactory: (c) => c.resolve(DismissAiSignalUseCase),
  });
  container.register('IngestFindingsUseCase', {
    useFactory: (c) => c.resolve(IngestFindingsUseCase),
  });
  container.register('IngestSbomUseCase', {
    useFactory: (c) => c.resolve(IngestSbomUseCase),
  });
  // IScanRunRepository is already bound to the same string token in
  // registerPhase11Repositories — no alias needed.
  container.register('ScanApplicationUseCase', {
    useFactory: (c) => c.resolve(ScanApplicationUseCase),
  });
  container.register('RescanApplicationUseCase', {
    useFactory: (c) => c.resolve(RescanApplicationUseCase),
  });
  container.register('ListScanRunsUseCase', {
    useFactory: (c) => c.resolve(ListScanRunsUseCase),
  });
  container.register('GetScanRunUseCase', {
    useFactory: (c) => c.resolve(GetScanRunUseCase),
  });
  container.register('ListScanTargetsUseCase', {
    useFactory: (c) => c.resolve(ListScanTargetsUseCase),
  });
}
