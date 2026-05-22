/**
 * ScanApplicationUseCase (Phase 11, task-74).
 *
 * Orchestrates a single scan run end-to-end:
 *   1. Load Application + resolve effective ScannerProfile (defaults when absent).
 *   2. Walk the working tree via IFileTreeReaderPort.
 *   3. For each enabled stage, run the corresponding scanner:
 *      - sbom: pure-domain SbomBuilder → ScanRun.componentsCount
 *      - sca:  OSV.dev adapter over the SBOM components → SbomVulnerabilityDraft[]
 *      - secrets: pure-domain SecretScanner → FindingDraft[]
 *      - sast/container/iac: agent-driven analyzers → FindingDraft[]
 *   4. Map FindingDraft[] → SecurityFinding[] (redact + dedup key + ownership
 *      resolution via git ownership + .shep/ownership.yaml).
 *   5. Persist via IFindingRepository.bulkInsertOrIgnore inside the existing
 *      transactional contract.
 *   6. Save the ScanRun (stages with terminal status, findingsCount).
 *   7. Update applications.lastScannedAt.
 *
 * Idempotent re-scan: the dedup unique index on security_findings means
 * a second run on an unchanged tree adds zero new rows (FR-8 / NFR-10).
 *
 * Failure isolation (NFR-25): a stage that throws is marked Failed and the
 * run is marked Partial — other stages continue.
 */

import { createHash, randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';

import type { IApplicationRepository } from '../../../ports/output/repositories/application-repository.interface.js';
import type { IFindingRepository } from '../../../ports/output/repositories/finding-repository.interface.js';
import type { IOwnerRepository } from '../../../ports/output/repositories/owner-repository.interface.js';
import type { IScanRunRepository } from '../../../ports/output/repositories/scan-run-repository.interface.js';
import type { IExploitIntelPort } from '../../../ports/output/services/exploit-intel-port.interface.js';
import type { IOwnershipYamlReader } from '../../../ports/output/services/ownership-yaml-reader.interface.js';
import type { IGitOwnershipPort } from '../../../ports/output/services/git-ownership-port.interface.js';
import type {
  IOsvVulnerabilityPort,
  OsvQueryComponent,
} from '../../../ports/output/services/osv-vulnerability-port.interface.js';
import type { IFileTreeReaderPort } from '../../../ports/output/services/file-tree-reader-port.interface.js';
import type { IAgentSecurityAnalyzer } from '../../../ports/output/services/agent-security-analyzer-port.interface.js';
import type { FindingDraft } from '../../../ports/output/services/finding-ingest-port.interface.js';

import { ApplicationNotFoundError } from '../../../../domain/errors/application-not-found.error.js';
import { findingDedupKey } from '../../../../domain/aspm/dedup/finding-dedup-key.js';
import { computeRawHash, redactSecrets } from '../../../../domain/aspm/redactor/redact-secrets.js';
import { resolveOwnership } from '../../../../domain/aspm/ownership/resolve-ownership.js';
import { scanForSecrets } from '../../../../domain/aspm/scan/secret-scanner.js';
import { buildSbom } from '../../../../domain/aspm/scan/sbom-builder.js';
import {
  FindingDomain,
  FindingState,
  ScanStageName,
  ScanStageStatus,
  ScanStatus,
  ScanTrigger,
  type Owner,
  type ScanRun,
  type ScanStage,
  type ScannerProfile,
  type SecurityFinding,
} from '../../../../domain/generated/output.js';
export interface ScanApplicationInput {
  applicationId: string;
  stagesEnabled?: ScanStageName[];
  triggeredBy?: ScanTrigger;
  /**
   * Optional override for the working-tree root to scan. When provided, the
   * scanner walks this path (and resolves git ownership from it) instead of
   * {@link Application.repositoryPath}. Use this to scan a Feature's git
   * worktree without inserting findings against a different applicationId —
   * the resulting findings still attribute to {@link applicationId}.
   */
  scanPath?: string;
}

export interface ScanApplicationResult {
  scanRunId: string;
  status: ScanStatus;
  findingsInserted: number;
  stages: ScanStage[];
}

const DEFAULT_STAGES: ScanStageName[] = [
  ScanStageName.Sbom,
  ScanStageName.Sca,
  ScanStageName.Secrets,
  ScanStageName.Sast,
  ScanStageName.Container,
  ScanStageName.Iac,
];

const SHA256_HEX = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

function resolveScannerProfile(profile: ScannerProfile | undefined): ScannerProfile {
  return (
    profile ?? {
      enabledStages: [...DEFAULT_STAGES],
      pathExcludes: [],
      autoRescan: true,
    }
  );
}

function pickStages(profile: ScannerProfile, override?: ScanStageName[]): ScanStageName[] {
  if (override && override.length > 0) return [...override];
  return profile.enabledStages.length > 0 ? [...profile.enabledStages] : [...DEFAULT_STAGES];
}

interface OwnershipResolverDeps {
  ownershipYaml: Awaited<ReturnType<IOwnershipYamlReader['read']>>;
  gitOwnership: IGitOwnershipPort;
  repoRoot: string;
  /** Cache from author email → Owner.id within a single scan to avoid repeated DB lookups. */
  emailToOwnerId: Map<string, string>;
  /** Persists git-derived owners. */
  upsertOwner: (email: string) => Promise<string | undefined>;
}

function deriveOwnerNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return (
    local
      .replace(/[._+-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || email
  );
}

async function resolveOwnerEmail(
  deps: OwnershipResolverDeps,
  assetPath: string | undefined
): Promise<string | undefined> {
  if (!assetPath) return undefined;
  const yamlOwner = resolveOwnership({
    assetPath,
    ownershipYaml: deps.ownershipYaml,
  });
  if (yamlOwner?.ownerId) return yamlOwner.ownerId;
  const candidates = await deps.gitOwnership.lookup({
    repoRoot: deps.repoRoot,
    assetPath,
  });
  const email = candidates[0]?.email;
  if (!email) return undefined;
  const cached = deps.emailToOwnerId.get(email);
  if (cached !== undefined) return cached;
  const ownerId = await deps.upsertOwner(email);
  if (ownerId !== undefined) deps.emailToOwnerId.set(email, ownerId);
  return ownerId;
}

@injectable()
export class ScanApplicationUseCase {
  constructor(
    @inject('IApplicationRepository') private readonly appRepo: IApplicationRepository,
    @inject('IFindingRepository') private readonly findingRepo: IFindingRepository,
    @inject('IOwnerRepository') private readonly ownerRepo: IOwnerRepository,
    @inject('IScanRunRepository') private readonly scanRunRepo: IScanRunRepository,
    @inject('IExploitIntelPort') private readonly exploitIntel: IExploitIntelPort,
    @inject('IOwnershipYamlReader') private readonly ownershipReader: IOwnershipYamlReader,
    @inject('IGitOwnershipPort') private readonly gitOwnership: IGitOwnershipPort,
    @inject('IOsvVulnerabilityPort') private readonly osvAdapter: IOsvVulnerabilityPort,
    @inject('IFileTreeReaderPort') private readonly fileReader: IFileTreeReaderPort,
    @inject('ISastAnalyzer') private readonly sastAnalyzer: IAgentSecurityAnalyzer,
    @inject('IContainerHardeningAnalyzer')
    private readonly containerAnalyzer: IAgentSecurityAnalyzer,
    @inject('IIacSecurityAnalyzer') private readonly iacAnalyzer: IAgentSecurityAnalyzer
  ) {}

  /**
   * Find-or-create an Owner from a git author email. Returns the owner id
   * (UUID) or undefined when persistence fails so callers can fall through
   * to "unowned" instead of failing the whole stage.
   *
   * If a concurrent scan inserts the same handle between findByHandle and
   * create, the unique-index violation is caught and we re-query — so the
   * second run still ends up pointing at the first run's row.
   */
  private async findOrCreateOwnerByEmail(email: string): Promise<string | undefined> {
    const trimmed = email.trim();
    if (trimmed.length === 0) return undefined;
    const handle = trimmed.toLowerCase();
    const existing = await this.ownerRepo.findByHandle(handle);
    if (existing !== null) return existing.id;
    const now = new Date();
    const owner: Owner = {
      id: randomUUID(),
      name: deriveOwnerNameFromEmail(trimmed),
      handle,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.ownerRepo.create(owner);
      return owner.id;
    } catch {
      const racedIn = await this.ownerRepo.findByHandle(handle);
      return racedIn?.id;
    }
  }

  async execute(input: ScanApplicationInput): Promise<ScanApplicationResult> {
    const app = await this.appRepo.findById(input.applicationId);
    if (app === null) throw new ApplicationNotFoundError(input.applicationId);

    const startedAt = new Date();
    const profile = resolveScannerProfile(app.scannerProfile);
    const stages = pickStages(profile, input.stagesEnabled);
    const scanRoot = input.scanPath ?? app.repositoryPath;

    const files = await this.fileReader.read({
      repoRoot: scanRoot,
      excludes: profile.pathExcludes,
    });

    const ownershipYaml = await this.ownershipReader.read(scanRoot);
    const ownershipDeps: OwnershipResolverDeps = {
      ownershipYaml,
      gitOwnership: this.gitOwnership,
      repoRoot: scanRoot,
      emailToOwnerId: new Map<string, string>(),
      upsertOwner: (email) => this.findOrCreateOwnerByEmail(email),
    };

    const scanRunId = randomUUID();
    const stageResults: ScanStage[] = [];
    const allFindings: SecurityFinding[] = [];
    let sbomComponentsCount = 0;
    type SbomComponent = ReturnType<typeof buildSbom>['components'][number];
    let sbomComponents: SbomComponent[] = [];

    for (const stageName of stages) {
      const stageStart = new Date();
      const stage: ScanStage = {
        name: stageName,
        status: ScanStageStatus.Running,
        startedAt: stageStart,
      };
      stageResults.push(stage);

      try {
        if (stageName === ScanStageName.Sbom) {
          const result = buildSbom(files);
          sbomComponents = result.components;
          sbomComponentsCount = result.components.length;
          stage.componentsCount = result.components.length;
        } else if (stageName === ScanStageName.Sca) {
          const queries: OsvQueryComponent[] = sbomComponents
            .filter((c): c is SbomComponent & { purl: string } => Boolean(c.purl))
            .map((c) => ({
              bomRef: c.bomRef,
              ecosystem: c.purl.replace(/^pkg:/, '').split('/')[0] ?? '',
              name: c.name,
              version: c.version,
              purl: c.purl,
            }));
          const osv = await this.osvAdapter.query({ components: queries });
          const drafts = vulnerabilitiesToDrafts(osv.vulnerabilities, sbomComponents);
          const findings = await this.mapDrafts(drafts, app.id, stageStart, ownershipDeps);
          allFindings.push(...findings);
          stage.findingsCount = findings.length;
        } else if (stageName === ScanStageName.Secrets) {
          const drafts = scanForSecrets(files);
          const findings = await this.mapDrafts(drafts, app.id, stageStart, ownershipDeps);
          allFindings.push(...findings);
          stage.findingsCount = findings.length;
        } else if (
          stageName === ScanStageName.Sast ||
          stageName === ScanStageName.Container ||
          stageName === ScanStageName.Iac
        ) {
          const analyzer =
            stageName === ScanStageName.Sast
              ? this.sastAnalyzer
              : stageName === ScanStageName.Container
                ? this.containerAnalyzer
                : this.iacAnalyzer;
          const result = await analyzer.run({ files });
          if (result.failed) throw new Error(result.errorMessage ?? `${stageName} agent failed`);
          const findings = await this.mapDrafts(result.drafts, app.id, stageStart, ownershipDeps);
          allFindings.push(...findings);
          stage.findingsCount = findings.length;
        }
        stage.status = ScanStageStatus.Succeeded;
      } catch (err) {
        stage.status = ScanStageStatus.Failed;
        stage.errorMessage = err instanceof Error ? err.message : String(err);
      } finally {
        stage.finishedAt = new Date();
      }
    }

    const { inserted } = await this.findingRepo.bulkInsertOrIgnore(deduplicate(allFindings));

    const finishedAt = new Date();
    const failedCount = stageResults.filter((s) => s.status === ScanStageStatus.Failed).length;
    const succeededCount = stageResults.filter(
      (s) => s.status === ScanStageStatus.Succeeded
    ).length;
    let runStatus: ScanStatus = ScanStatus.Succeeded;
    if (failedCount === stageResults.length) runStatus = ScanStatus.Failed;
    else if (failedCount > 0 && succeededCount > 0) runStatus = ScanStatus.Partial;

    const scanRun: ScanRun = {
      id: scanRunId,
      applicationId: app.id,
      triggeredBy: input.triggeredBy ?? ScanTrigger.User,
      status: runStatus,
      startedAt,
      finishedAt,
      stages: stageResults,
      findingsCount: inserted,
      createdAt: startedAt,
      updatedAt: finishedAt,
    };
    await this.scanRunRepo.save(scanRun);

    if (runStatus !== ScanStatus.Failed) {
      await this.appRepo.update(app.id, { lastScannedAt: finishedAt });
    }

    void sbomComponentsCount; // kept for future stage-aware reporting

    return {
      scanRunId,
      status: runStatus,
      findingsInserted: inserted,
      stages: stageResults,
    };
  }

  private async mapDrafts(
    drafts: readonly FindingDraft[],
    applicationId: string,
    now: Date,
    ownershipDeps: OwnershipResolverDeps
  ): Promise<SecurityFinding[]> {
    const out: SecurityFinding[] = [];
    for (const draft of drafts) {
      const ownerId = await resolveOwnerEmail(ownershipDeps, draft.locationPath);
      const cveId = draft.cveId;
      const kev = cveId ? await this.exploitIntel.isKev(cveId) : undefined;
      const epssPercentile = cveId ? await this.exploitIntel.getEpssPercentile(cveId) : undefined;
      const rawJson = JSON.stringify(draft);
      const redactedRaw = redactSecrets(draft.scannerRaw ?? rawJson);
      const redactedDesc = redactSecrets(draft.description);

      out.push({
        id: randomUUID(),
        applicationId,
        findingDomain: draft.findingDomain,
        ruleId: draft.ruleId,
        title: draft.title,
        description: redactedDesc.redacted,
        locationPath: draft.locationPath,
        locationLine: draft.locationLine,
        scannerRaw: redactedRaw.redacted,
        scannerRawHash: computeRawHash(rawJson, SHA256_HEX),
        rawSeverity: draft.rawSeverity,
        canonicalSeverity: draft.canonicalSeverity,
        cveId,
        cweId: draft.cweId,
        owaspAsvsControlId: draft.owaspAsvsControlId,
        ...(kev !== undefined ? { kev } : {}),
        ...(epssPercentile !== undefined && epssPercentile !== null ? { epssPercentile } : {}),
        ownerId,
        state: FindingState.Open,
        source: draft.source,
        discoveredAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      } as SecurityFinding);
    }
    return out;
  }
}

function deduplicate(findings: readonly SecurityFinding[]): SecurityFinding[] {
  const seen = new Set<string>();
  const out: SecurityFinding[] = [];
  for (const f of findings) {
    const key = findingDedupKey({
      applicationId: f.applicationId,
      findingDomain: f.findingDomain,
      ruleId: f.ruleId,
      locationPath: f.locationPath,
      locationLine: f.locationLine,
      cveId: f.cveId,
    });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

interface SbomComponentLite {
  bomRef: string;
  name: string;
  version?: string;
}

function vulnerabilitiesToDrafts(
  vulns: {
    id: string;
    cveId?: string;
    cweIds?: string[];
    description?: string;
    canonicalSeverity: FindingDraft['canonicalSeverity'];
    rawSeverity: string;
    affectedComponentRefs: string[];
    source?: string;
  }[],
  components: readonly SbomComponentLite[]
): FindingDraft[] {
  const byRef = new Map<string, SbomComponentLite>(components.map((c) => [c.bomRef, c]));
  const drafts: FindingDraft[] = [];
  for (const v of vulns) {
    for (const ref of v.affectedComponentRefs.length > 0 ? v.affectedComponentRefs : ['']) {
      const component = ref.length > 0 ? byRef.get(ref) : undefined;
      const label = component
        ? `${component.name}${component.version ? `@${component.version}` : ''}`
        : ref;
      drafts.push({
        ruleId: v.id,
        title: `${v.id}: ${label}`,
        description: v.description ?? `${v.id} affects ${label}`,
        findingDomain: FindingDomain.Dependency,
        locationPath: ref.length > 0 ? ref : undefined,
        rawSeverity: v.rawSeverity,
        canonicalSeverity: v.canonicalSeverity,
        cveId: v.cveId,
        cweId: v.cweIds?.[0],
        source: v.source ?? 'scan:sca',
      });
    }
  }
  return drafts;
}
