/**
 * @module Shep.Domain.Entities.Aspm.ComplianceControl
 *
 * A ComplianceControl row defines a single control within a compliance
 * framework (OWASP ASVS, CWE Top 25). Findings link to zero-or-more
 * controls; the SARIF adapter populates these links from taxa references.
 *
 * Regulated frameworks (SOC 2, PCI DSS, HIPAA) are additive rows in
 * the same table — no schema change required.
 */
import "../../../common/base.tsp";
import "../../value-objects/aspm/compliance-framework.tsp";

@doc("Single control within a compliance framework (OWASP ASVS / CWE Top 25 / ...)")
model ComplianceControl extends SoftDeletableEntity {
  @doc("Compliance framework this control belongs to")
  frameworkId: ComplianceFramework;

  @doc("Framework-specific control identifier (e.g. V2.1.1, CWE-79)")
  controlId: string;

  @doc("Short human-readable title")
  title: string;

  @doc("Long-form description of what the control covers")
  description: string;
}
