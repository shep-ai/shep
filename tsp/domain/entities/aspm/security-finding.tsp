/**
 * @module Shep.Domain.Entities.Aspm.SecurityFinding
 *
 * SecurityFinding is the unified record produced by ingestion adapters
 * (SARIF, CycloneDX) across every finding domain (Code/Dependency/
 * Secret/Container/Cloud/Api/Identity/Runtime/Compliance/Ai). Findings
 * are soft-deletable (NFR-12) — resolutions and closures preserve
 * historical state for audit.
 *
 * Deduplication key (FR-8):
 *   (applicationId, findingDomain, ruleId, locationPath, locationLine, cveId)
 *
 * Related entities:
 *  - [[Application]] is the primary asset anchor.
 *  - [[Owner]] is resolved deterministically at ingestion time.
 *  - [[RiskScore]] history is keyed by findingId; currentRiskScoreId
 *    points at the latest entry for O(1) dashboard reads.
 *  - [[RiskException]] may temporarily mask the finding's effective state.
 *  - [[ComplianceControl]] links are populated from SARIF taxa references.
 */
import "../../../common/base.tsp";
import "../../../common/scalars.tsp";
import "../../value-objects/aspm/canonical-severity.tsp";
import "../../value-objects/aspm/finding-domain.tsp";
import "../../value-objects/aspm/finding-state.tsp";

@doc("Unified security finding produced by ingestion adapters across every ASPM domain")
model SecurityFinding extends SoftDeletableEntity {
  @doc("Primary asset anchor — the Application this finding attaches to")
  applicationId: UUID;

  @doc("Optional Service this finding attaches to (sub-asset of Application)")
  serviceId?: UUID;

  @doc("Optional ApiAsset this finding attaches to")
  apiAssetId?: UUID;

  @doc("Optional CloudEnvironment this finding attaches to")
  cloudEnvironmentId?: UUID;

  @doc("Finding domain (Code/Dependency/Secret/Container/Cloud/Api/Identity/Runtime/Compliance/Ai)")
  findingDomain: FindingDomain;

  @doc("Scanner rule identifier (e.g. semgrep.rule.id, codeql.query.id, trivy CVE id)")
  ruleId: string;

  @doc("Short human-readable title")
  title: string;

  @doc("Long-form description (post-redaction)")
  description: string;

  @doc("Repo-relative path of the finding location (POSIX separators)")
  locationPath?: string;

  @doc("1-based line number of the finding location")
  locationLine?: int32;

  @doc("Raw scanner output (JSON-serialized, post-redaction)")
  scannerRaw?: string;

  @doc("SHA-256 hash of the original scanner-supplied raw document (audit-only)")
  scannerRawHash?: string;

  @doc("Raw scanner severity string as emitted (e.g. HIGH, error, 8.1) — preserved for audit")
  rawSeverity: string;

  @doc("Canonical severity used for filtering, SLAs, and posture rollups")
  canonicalSeverity: CanonicalSeverity;

  @doc("CVE identifier when applicable (e.g. CVE-2024-12345)")
  cveId?: string;

  @doc("CWE identifier when applicable (e.g. CWE-79)")
  cweId?: string;

  @doc("OWASP ASVS control id when the scanner emitted a taxa reference")
  owaspAsvsControlId?: string;

  @doc("True iff the finding's CVE is present in CISA's Known Exploited Vulnerabilities catalog")
  kev?: boolean;

  @doc("FIRST EPSS exploit-probability percentile (0..1) when known; null when EPSS lookup is unavailable")
  epssPercentile?: float64;

  @doc("Resolved owner of the finding")
  ownerId?: UUID;

  @doc("Lifecycle state of the finding (see also: read-time effective state w/ exceptions)")
  state: FindingState;

  @doc("Foreign key to the latest RiskScore for this finding (O(1) dashboard reads)")
  currentRiskScoreId?: UUID;

  @doc("Optional link to a Shep WorkItem this finding has been routed into")
  workItemId?: UUID;

  @doc("Source of ingestion (e.g. sarif:semgrep, sarif:codeql, cyclonedx:1.5)")
  source: string;

  @doc("When the finding was first discovered (used for SLA math)")
  discoveredAt: utcDateTime;

  @doc("When the finding was most recently re-observed by a scanner")
  lastSeenAt: utcDateTime;

  @doc("When the finding was first observed as fixed")
  firstFixedAt?: utcDateTime;
}
