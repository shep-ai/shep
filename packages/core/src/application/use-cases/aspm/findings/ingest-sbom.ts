/**
 * IngestSbomUseCase (feature 098, phase 4, task-21).
 *
 * Shape mirror of {@link IngestFindingsUseCase} for SBOM documents:
 *
 *   1. Verify the target Application exists.
 *   2. Parse the document via the ISbomPort.
 *   3. For every vulnerability × affected component pair, emit a
 *      dependency-domain SecurityFinding draft.
 *   4. Redact secrets in description before persistence; SHA-256-hash the
 *      original raw vuln blob (audit only).
 *   5. Resolve ownership per-finding via the ownership.yaml reader
 *      (best-effort — package-locations rarely have a meaningful path).
 *   6. Compute the dedup key client-side so re-ingesting the same BOM is
 *      a no-op (FR-8 / NFR-10).
 *   7. Persist via {@link IFindingRepository.bulkInsertOrIgnore} inside a
 *      single SQLite transaction.
 *   8. Return an ingestion-run summary (NFR-15 audit record).
 *
 * The dedup key includes the affected component `bom-ref` as the
 * synthetic `locationPath`, so the same CVE attached to a different
 * dependency is a distinct finding rather than a collision.
 */

import { createHash, randomUUID } from 'node:crypto';
import { inject, injectable } from 'tsyringe';

import type { IApplicationRepository } from '../../../ports/output/repositories/application-repository.interface.js';
import type { IFindingRepository } from '../../../ports/output/repositories/finding-repository.interface.js';
import type { IExploitIntelPort } from '../../../ports/output/services/exploit-intel-port.interface.js';
import type { IOwnershipYamlReader } from '../../../ports/output/services/ownership-yaml-reader.interface.js';
import type {
  ISbomPort,
  SbomComponentDraft,
  SbomVulnerabilityDraft,
} from '../../../ports/output/services/sbom-port.interface.js';
import {
  enrichWithExploitIntel,
  lookupEpss,
  lookupKev,
  type ExploitIntelLookup,
} from './enrich-with-exploit-intel.js';
import { ApplicationNotFoundError } from '../../../../domain/errors/application-not-found.error.js';
import { findingDedupKey } from '../../../../domain/aspm/dedup/finding-dedup-key.js';
import { computeRawHash, redactSecrets } from '../../../../domain/aspm/redactor/redact-secrets.js';
import { resolveOwnership } from '../../../../domain/aspm/ownership/resolve-ownership.js';
import {
  FindingDomain,
  FindingState,
  type SecurityFinding,
} from '../../../../domain/generated/output.js';

export interface IngestSbomInput {
  applicationId: string;
  /** Raw CycloneDX document body (UTF-8 string). */
  document: string;
  /** Optional override; defaults to the adapter's policy default. */
  maxBytes?: number;
}

export interface IngestSbomResult {
  inserted: number;
  duplicates: number;
  total: number;
  componentCount: number;
  toolName?: string;
  sourceLabel: string;
  documentHash: string;
  durationMs: number;
}

const SHA256_HEX = (input: string): string =>
  createHash('sha256').update(input, 'utf8').digest('hex');

@injectable()
export class IngestSbomUseCase {
  constructor(
    @inject('IApplicationRepository') private readonly appRepo: IApplicationRepository,
    @inject('IFindingRepository') private readonly findingRepo: IFindingRepository,
    @inject('ISbomPort') private readonly sbomPort: ISbomPort,
    @inject('IOwnershipYamlReader') private readonly ownershipReader: IOwnershipYamlReader,
    @inject('IExploitIntelPort') private readonly exploitIntel: IExploitIntelPort
  ) {}

  async execute(input: IngestSbomInput): Promise<IngestSbomResult> {
    const startedAt = Date.now();

    const app = await this.appRepo.findById(input.applicationId);
    if (app === null) throw new ApplicationNotFoundError(input.applicationId);

    const sbom = await this.sbomPort.parse({
      document: input.document,
      maxBytes: input.maxBytes,
    });

    const ownershipYaml = await this.ownershipReader.read(app.repositoryPath);
    const documentHash = computeRawHash(input.document, SHA256_HEX);
    const now = new Date(startedAt);

    // Batch KEV/EPSS enrichment once per ingestion run.
    const cveIds = sbom.vulnerabilities
      .map((v) => v.cveId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    const exploitLookup = await enrichWithExploitIntel(this.exploitIntel, cveIds);

    const componentByRef = new Map<string, SbomComponentDraft>();
    for (const component of sbom.components) {
      componentByRef.set(component.bomRef, component);
    }

    const seenDedupKeys = new Set<string>();
    const findings: SecurityFinding[] = [];
    let intraBatchDuplicates = 0;
    let totalDrafts = 0;

    for (const vuln of sbom.vulnerabilities) {
      // A vulnerability with no affected components still emits one row so
      // we don't silently lose the finding.
      const refs = vuln.affectedComponentRefs.length > 0 ? vuln.affectedComponentRefs : [''];
      for (const ref of refs) {
        totalDrafts += 1;
        const component = ref.length > 0 ? componentByRef.get(ref) : undefined;
        const locationPath = ref.length > 0 ? ref : undefined;

        const dedupKey = findingDedupKey({
          applicationId: input.applicationId,
          findingDomain: FindingDomain.Dependency,
          ruleId: vuln.id,
          locationPath,
          cveId: vuln.cveId,
        });
        if (seenDedupKeys.has(dedupKey)) {
          intraBatchDuplicates += 1;
          continue;
        }
        seenDedupKeys.add(dedupKey);

        const ownerResolution = resolveOwnership({
          assetPath: locationPath ?? '',
          ownershipYaml,
        });

        findings.push(
          buildSbomFinding({
            applicationId: input.applicationId,
            sourceLabel: sbom.sourceLabel,
            vuln,
            component,
            locationPath,
            ownerId: ownerResolution?.ownerId,
            now,
            exploitLookup,
          })
        );
      }
    }

    const { inserted, duplicates } = await this.findingRepo.bulkInsertOrIgnore(findings);

    return {
      inserted,
      duplicates: duplicates + intraBatchDuplicates,
      total: totalDrafts,
      componentCount: sbom.components.length,
      toolName: sbom.toolName,
      sourceLabel: sbom.sourceLabel,
      documentHash,
      durationMs: Date.now() - startedAt,
    };
  }
}

interface BuildSbomFindingInput {
  applicationId: string;
  sourceLabel: string;
  vuln: SbomVulnerabilityDraft;
  component: SbomComponentDraft | undefined;
  locationPath: string | undefined;
  ownerId: string | undefined;
  now: Date;
  exploitLookup: ExploitIntelLookup;
}

function buildSbomFinding(input: BuildSbomFindingInput): SecurityFinding {
  const { vuln, component, locationPath, ownerId, applicationId, sourceLabel, now, exploitLookup } =
    input;
  const componentLabel = component
    ? `${component.name}${component.version ? `@${component.version}` : ''}`
    : (locationPath ?? 'unknown');
  const title = `${vuln.id}: ${componentLabel}`;
  const baseDescription = vuln.description ?? `${vuln.id} affects ${componentLabel}`;
  const redactedDesc = redactSecrets(baseDescription);
  const rawJson = JSON.stringify({
    vulnerability: vuln,
    component,
  });
  const redactedRaw = redactSecrets(rawJson);
  const rawHash = computeRawHash(rawJson, SHA256_HEX);

  const kev = lookupKev(exploitLookup, vuln.cveId);
  const epssPercentile = lookupEpss(exploitLookup, vuln.cveId);

  return {
    id: randomUUID(),
    applicationId,
    findingDomain: FindingDomain.Dependency,
    ruleId: vuln.id,
    title,
    description: redactedDesc.redacted,
    locationPath,
    scannerRaw: redactedRaw.redacted,
    scannerRawHash: rawHash,
    rawSeverity: vuln.rawSeverity,
    canonicalSeverity: vuln.canonicalSeverity,
    cveId: vuln.cveId,
    cweId: vuln.cweIds?.[0],
    kev,
    epssPercentile,
    ownerId,
    state: FindingState.Open,
    source: sourceLabel,
    discoveredAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  } as SecurityFinding;
}
