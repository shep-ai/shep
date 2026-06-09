/**
 * /aspm/compliance — Compliance Surface
 *
 * Feature 098, phase 9 / task-54 (FR-35). Server component that resolves
 * `GetComplianceCoverageUseCase` from the DI container and renders the
 * per-framework coverage matrix. Defaults to OWASP ASVS + CWE Top 25 in
 * MVP; regulated frameworks slot in later as additional rows in the
 * compliance_controls table — no presentation change required.
 */

import type {
  GetComplianceCoverageUseCase,
  ComplianceCoverageResult,
} from '@shepai/core/application/use-cases/aspm/compliance/get-compliance-coverage';
import { resolve } from '@/lib/server-container';
import {
  ComplianceCoverageView,
  type FrameworkCoverageView,
} from '@/components/features/aspm/compliance-coverage-view';

export const dynamic = 'force-dynamic';

export default async function AspmCompliancePage() {
  let coverage: ComplianceCoverageResult | null = null;
  let coverageError: string | null = null;

  try {
    coverage = await resolve<GetComplianceCoverageUseCase>(
      'GetComplianceCoverageUseCase'
    ).execute();
  } catch (err) {
    coverageError = err instanceof Error ? err.message : String(err);
  }

  const frameworks: FrameworkCoverageView[] = coverage
    ? coverage.frameworks.map((f) => ({
        frameworkId: f.frameworkId,
        totalControls: f.totalControls,
        controlsWithOpenFindings: f.controlsWithOpenFindings,
        controlsWithoutEvidence: f.controlsWithoutEvidence,
        totalOpenFindingLinks: f.totalOpenFindingLinks,
        controls: f.controls.map((c) => ({
          controlId: c.controlId,
          controlIdentifier: c.controlIdentifier,
          title: c.title,
          openFindingCount: c.openFindingCount,
        })),
      }))
    : [];

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Compliance</h1>
        <p className="text-muted-foreground text-sm">
          Per-framework coverage of OWASP ASVS and CWE Top 25 controls, populated from SARIF taxa
          references during ingestion.
        </p>
      </header>

      <ComplianceCoverageView frameworks={frameworks} error={coverageError} />
    </div>
  );
}
