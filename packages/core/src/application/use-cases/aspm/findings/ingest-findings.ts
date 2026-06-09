/**
 * IngestFindingsUseCase (feature 098, phase 3, FR-8 / NFR-6 / NFR-10).
 *
 * Orchestrates the full SARIF (and later, SBOM) ingestion pipeline:
 *
 *   1. Verify the target Application exists.
 *   2. Parse the document via the IFindingIngestPort.
 *   3. Redact secrets in description / scannerRaw via the pure-domain
 *      Redactor and hash the original raw blob (SHA-256, audit only).
 *   4. Resolve ownership per-finding via resolveOwnership (best-effort —
 *      unowned findings still land; ownership can be reassigned later).
 *   5. Compute the dedup key client-side (so the summary reports
 *      duplicates without round-tripping the DB).
 *   6. Persist via {@link IFindingRepository.bulkInsertOrIgnore} inside a
 *      single SQLite transaction.
 *   7. Return an ingestion-run summary (NFR-15 audit record).
 *
 * Determinism (NFR-10): re-ingesting the same document yields zero new
 * rows. The dedup key is computed pre-INSERT and the partial unique
 * index enforces the same shape at the storage layer.
 */

import { createHash, randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';

import { ApplicationNotFoundError } from '../../../../domain/errors/application-not-found.error.js';
import { findingDedupKey } from '../../../../domain/aspm/dedup/finding-dedup-key.js';
import { redactSecrets, computeRawHash } from '../../../../domain/aspm/redactor/redact-secrets.js';
import { resolveOwnership } from '../../../../domain/aspm/ownership/resolve-ownership.js';
import {
  ComplianceFramework,
  FindingState,
  type SecurityFinding,
} from '../../../../domain/generated/output.js';
import type {
  FindingDraft,
  IFindingIngestPort,
} from '../../../ports/output/services/finding-ingest-port.interface.js';
import type { IFindingRepository } from '../../../ports/output/repositories/finding-repository.interface.js';
import type { IApplicationRepository } from '../../../ports/output/repositories/application-repository.interface.js';
import type { IComplianceControlRepository } from '../../../ports/output/repositories/compliance-control-repository.interface.js';
import type { IExploitIntelPort } from '../../../ports/output/services/exploit-intel-port.interface.js';
import type { IOwnershipYamlReader } from '../../../ports/output/services/ownership-yaml-reader.interface.js';
import {
  enrichWithExploitIntel,
  lookupEpss,
  lookupKev,
  type ExploitIntelLookup,
} from './enrich-with-exploit-intel.js';

export interface IngestFindingsInput {
  applicationId: string;
  /** Source label persisted on every finding (e.g. `sarif:semgrep`). */
  sourceType: 'sarif' | 'sbom';
  /** Raw scanner document (UTF-8 string). */
  document: string;
  /** Optional override; defaults to the adapter's policy default. */
  maxBytes?: number;
}

export interface IngestFindingsResult {
  /** Distinct findings actually persisted on this run. */
  inserted: number;
  /** Findings whose dedup key collided with an existing row. */
  duplicates: number;
  /** Total drafts emitted by the adapter (inserted + duplicates + redacted-as-duplicates). */
  total: number;
  /** Tool reported by the scanner document (e.g. `semgrep`). */
  toolName?: string;
  /** Source label written to every row. */
  sourceLabel: string;
  /** SHA-256 hash of the original document (audit trail). */
  documentHash: string;
  /** Duration in milliseconds (NFR-6 observability). */
  durationMs: number;
  /**
   * Number of (finding ↔ compliance control) links written on this run
   * (FR-34). Idempotent: re-running ingestion never adds duplicates.
   */
  complianceLinksWritten: number;
}

const SHA256_HEX = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

@injectable()
export class IngestFindingsUseCase {
  constructor(
    @inject('IApplicationRepository') private readonly appRepo: IApplicationRepository,
    @inject('IFindingRepository') private readonly findingRepo: IFindingRepository,
    @inject('IFindingIngestPort') private readonly ingestPort: IFindingIngestPort,
    @inject('IOwnershipYamlReader') private readonly ownershipReader: IOwnershipYamlReader,
    @inject('IExploitIntelPort') private readonly exploitIntel: IExploitIntelPort,
    @inject('IComplianceControlRepository')
    private readonly complianceRepo: IComplianceControlRepository
  ) {}

  async execute(input: IngestFindingsInput): Promise<IngestFindingsResult> {
    const startedAt = Date.now();

    const app = await this.appRepo.findById(input.applicationId);
    if (app === null) throw new ApplicationNotFoundError(input.applicationId);

    const parsed = await this.ingestPort.parse({
      document: input.document,
      maxBytes: input.maxBytes,
    });

    const ownershipYaml = await this.ownershipReader.read(app.repositoryPath);
    const documentHash = computeRawHash(input.document, SHA256_HEX);
    const now = new Date(startedAt);

    // Batch the KEV/EPSS lookups once per ingestion run (one call per distinct
    // CVE, regardless of how many findings reference it). Findings without a
    // cveId skip enrichment entirely.
    const cveIds = parsed.drafts
      .map((d) => d.cveId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const exploitLookup = await enrichWithExploitIntel(this.exploitIntel, cveIds);

    const seenDedupKeys = new Set<string>();
    const findings: SecurityFinding[] = [];
    // Findings whose dedup tuple needs a compliance-link resolution pass.
    // Keyed by the locally generated finding id (note: the canonical id in
    // the DB may differ after INSERT OR IGNORE collapses duplicates — we
    // look up the canonical id post-insert via findIdByDedupTuple).
    const taxaByDedupKey = new Map<string, { draft: FindingDraft; tuple: TaxaResolutionTuple }>();
    let intraBatchDuplicates = 0;

    for (const draft of parsed.drafts) {
      const dedupKey = findingDedupKey({
        applicationId: input.applicationId,
        findingDomain: draft.findingDomain,
        ruleId: draft.ruleId,
        locationPath: draft.locationPath,
        locationLine: draft.locationLine,
        cveId: draft.cveId,
      });
      if (seenDedupKeys.has(dedupKey)) {
        intraBatchDuplicates += 1;
        continue;
      }
      seenDedupKeys.add(dedupKey);

      const ownerResolution = resolveOwnership({
        assetPath: draft.locationPath ?? '',
        ownershipYaml,
      });

      findings.push(
        buildFinding(draft, input.applicationId, ownerResolution?.ownerId, now, exploitLookup)
      );

      if (hasComplianceTaxa(draft)) {
        taxaByDedupKey.set(dedupKey, {
          draft,
          tuple: {
            applicationId: input.applicationId,
            findingDomain: draft.findingDomain,
            ruleId: draft.ruleId,
            locationPath: draft.locationPath,
            locationLine: draft.locationLine,
            cveId: draft.cveId,
          },
        });
      }
    }

    const { inserted, duplicates } = await this.findingRepo.bulkInsertOrIgnore(findings);

    const complianceLinksWritten = await this.attachComplianceLinks(taxaByDedupKey);

    return {
      inserted,
      duplicates: duplicates + intraBatchDuplicates,
      total: parsed.drafts.length,
      toolName: parsed.toolName,
      sourceLabel: parsed.sourceLabel,
      documentHash,
      durationMs: Date.now() - startedAt,
      complianceLinksWritten,
    };
  }

  /**
   * Resolve canonical control ids for each draft's taxa references and
   * write `finding_compliance_controls` join rows against the canonical
   * finding id (FR-34). Idempotent — the join table's unique index makes
   * re-running ingestion a no-op.
   */
  private async attachComplianceLinks(
    taxaByDedupKey: ReadonlyMap<string, { draft: FindingDraft; tuple: TaxaResolutionTuple }>
  ): Promise<number> {
    if (taxaByDedupKey.size === 0) return 0;

    // Per-run cache so we look up each (framework, identifier) once even
    // when the same rule produces many findings.
    const controlIdCache = new Map<string, string | null>();
    const resolveControl = async (
      framework: ComplianceFramework,
      identifier: string
    ): Promise<string | null> => {
      const cacheKey = `${framework}|${identifier}`;
      const cached = controlIdCache.get(cacheKey);
      if (cached !== undefined) return cached;
      const id = await this.complianceRepo.findIdByControlIdentifier(framework, identifier);
      controlIdCache.set(cacheKey, id);
      return id;
    };

    let linksWritten = 0;

    for (const { draft, tuple } of taxaByDedupKey.values()) {
      const canonicalId = await this.findingRepo.findIdByDedupTuple(tuple);
      if (canonicalId === null) continue;

      const controlIds: string[] = [];
      if (draft.cweId !== undefined && draft.cweId.length > 0) {
        const id = await resolveControl(ComplianceFramework.CweTop25, draft.cweId);
        if (id !== null) controlIds.push(id);
      }
      if (draft.owaspAsvsControlId !== undefined && draft.owaspAsvsControlId.length > 0) {
        const id = await resolveControl(ComplianceFramework.OwaspAsvs, draft.owaspAsvsControlId);
        if (id !== null) controlIds.push(id);
      }

      if (controlIds.length > 0) {
        await this.complianceRepo.linkManyToFinding(canonicalId, controlIds);
        linksWritten += controlIds.length;
      }
    }

    return linksWritten;
  }
}

interface TaxaResolutionTuple {
  applicationId: string;
  findingDomain: string;
  ruleId: string;
  locationPath?: string;
  locationLine?: number;
  cveId?: string;
}

function hasComplianceTaxa(draft: FindingDraft): boolean {
  return (
    (typeof draft.cweId === 'string' && draft.cweId.length > 0) ||
    (typeof draft.owaspAsvsControlId === 'string' && draft.owaspAsvsControlId.length > 0)
  );
}

function buildFinding(
  draft: FindingDraft,
  applicationId: string,
  ownerId: string | undefined,
  now: Date,
  exploitLookup: ExploitIntelLookup
): SecurityFinding {
  const redactedDesc = redactSecrets(draft.description);
  const redactedRaw =
    draft.scannerRaw !== undefined ? redactSecrets(draft.scannerRaw) : { redacted: undefined };
  const rawHash =
    draft.scannerRaw !== undefined ? computeRawHash(draft.scannerRaw, SHA256_HEX) : undefined;
  const kev = lookupKev(exploitLookup, draft.cveId);
  const epssPercentile = lookupEpss(exploitLookup, draft.cveId);

  return {
    id: randomUUID(),
    applicationId,
    findingDomain: draft.findingDomain,
    ruleId: draft.ruleId,
    title: draft.title,
    description: redactedDesc.redacted,
    locationPath: draft.locationPath,
    locationLine: draft.locationLine,
    scannerRaw: redactedRaw.redacted,
    scannerRawHash: rawHash,
    rawSeverity: draft.rawSeverity,
    canonicalSeverity: draft.canonicalSeverity,
    cveId: draft.cveId,
    cweId: draft.cweId,
    owaspAsvsControlId: draft.owaspAsvsControlId,
    kev,
    epssPercentile,
    ownerId,
    state: FindingState.Open,
    source: draft.source,
    discoveredAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  } as SecurityFinding;
}
