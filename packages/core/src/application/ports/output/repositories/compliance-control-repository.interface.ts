/**
 * ComplianceControl Repository Interface (Output Port)
 *
 * Feature 098, phase 9 (Compliance Surface) — task-52. Persistence
 * contract for the ComplianceControl entity (OWASP ASVS / CWE Top 25 in
 * MVP; regulated frameworks land as additional rows later) and the
 * finding↔control join table that the SARIF adapter populates from taxa
 * references during ingestion (FR-34).
 *
 * Soft-delete is honored on the controls themselves (NFR-12); the join
 * rows are hard-delete on demand because they carry no audit signal of
 * their own — the parent SecurityFinding's soft-delete drives audit.
 */

import type {
  ComplianceControl,
  ComplianceFramework,
} from '../../../../domain/generated/output.js';

export interface ComplianceCoverageRow {
  /** Stable `compliance_controls.id` for join writes. */
  controlId: string;
  /** Framework-specific control identifier, e.g. `V5.3.4` or `CWE-89`. */
  controlIdentifier: string;
  /** Human-readable title. */
  title: string;
  /** Number of open findings linked to this control. */
  openFindingCount: number;
}

export interface IComplianceControlRepository {
  /** Find a single control by its primary key. */
  findById(id: string): Promise<ComplianceControl | null>;

  /**
   * Find every control belonging to the given framework, ordered by
   * control_id ASC for stable UI rendering.
   */
  findByFramework(frameworkId: ComplianceFramework): Promise<ComplianceControl[]>;

  /**
   * Resolve a control's id by `(frameworkId, controlIdentifier)`. Used by
   * the ingestion path to look up the canonical row before writing a
   * finding↔control join (task-53). Returns null when the framework /
   * identifier pair isn't known — callers should skip rather than throw
   * so unknown scanner taxa never break ingestion.
   */
  findIdByControlIdentifier(
    frameworkId: ComplianceFramework,
    controlIdentifier: string
  ): Promise<string | null>;

  /**
   * Link a finding to a control. Idempotent on the
   * (finding_id, control_id) pair — re-running ingestion never adds
   * duplicate links (FR-34 / NFR-10).
   */
  linkToFinding(findingId: string, controlId: string): Promise<void>;

  /**
   * Bulk variant of {@link linkToFinding} wrapped in a single SQLite
   * transaction (NFR-6). Each pair is INSERT-OR-IGNORE'd against the
   * unique index so duplicates from a re-ingestion are no-ops.
   */
  linkManyToFinding(findingId: string, controlIds: readonly string[]): Promise<void>;

  /** Every control linked to the given finding. */
  findControlsForFinding(findingId: string): Promise<ComplianceControl[]>;

  /**
   * Per-control coverage rollup for a single framework. Each row reports
   * the number of OPEN findings (state ∈ Open / Triaged / InProgress)
   * linked to that control. Controls with zero open findings still
   * appear so the UI can show "covered without evidence".
   */
  getCoverageForFramework(frameworkId: ComplianceFramework): Promise<ComplianceCoverageRow[]>;
}
