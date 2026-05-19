/**
 * GetComplianceCoverageUseCase (feature 098, phase 9 / task-54, FR-35).
 *
 * Returns per-framework compliance coverage for the /aspm/compliance
 * view: per control row {controlId, title, openFindingCount} plus three
 * roll-up counters (covered, controlsWithOpenFindings, controlsWithoutEvidence).
 *
 * Designed presentation-agnostic per .claude/rules/code-quality.md so the
 * CLI (`shep aspm compliance`) and the web view consume the same shape.
 *
 * Determinism: a pure read from the repository — no clock, no random,
 * no env access.
 */

import { inject, injectable } from 'tsyringe';

import { ComplianceFramework } from '../../../../domain/generated/output.js';
import type {
  ComplianceCoverageRow,
  IComplianceControlRepository,
} from '../../../ports/output/repositories/compliance-control-repository.interface.js';

export interface GetComplianceCoverageInput {
  /** Frameworks to include. Defaults to every supported framework. */
  frameworks?: readonly ComplianceFramework[];
}

export interface FrameworkCoverage {
  frameworkId: ComplianceFramework;
  /** Total control rows in the framework (covered = open-or-not-open). */
  totalControls: number;
  /** Controls with at least one OPEN finding. */
  controlsWithOpenFindings: number;
  /**
   * Controls covered by the framework that have no open findings linked.
   * Surfaced in the UI as "covered without evidence" — useful for risk
   * assessments that ask "do we have any signal on this control?".
   */
  controlsWithoutEvidence: number;
  /** Total OPEN finding ↔ control links across this framework. */
  totalOpenFindingLinks: number;
  /** Per-control rows ordered by control identifier ascending. */
  controls: ComplianceCoverageRow[];
}

export interface ComplianceCoverageResult {
  frameworks: FrameworkCoverage[];
}

const DEFAULT_FRAMEWORKS: readonly ComplianceFramework[] = [
  ComplianceFramework.OwaspAsvs,
  ComplianceFramework.CweTop25,
];

@injectable()
export class GetComplianceCoverageUseCase {
  constructor(
    @inject('IComplianceControlRepository')
    private readonly controls: IComplianceControlRepository
  ) {}

  async execute(input: GetComplianceCoverageInput = {}): Promise<ComplianceCoverageResult> {
    const frameworks = input.frameworks ?? DEFAULT_FRAMEWORKS;

    const perFramework = await Promise.all(
      frameworks.map(async (frameworkId) => {
        const rows = await this.controls.getCoverageForFramework(frameworkId);
        return buildFrameworkCoverage(frameworkId, rows);
      })
    );

    return { frameworks: perFramework };
  }
}

export function buildFrameworkCoverage(
  frameworkId: ComplianceFramework,
  rows: ComplianceCoverageRow[]
): FrameworkCoverage {
  let controlsWithOpenFindings = 0;
  let controlsWithoutEvidence = 0;
  let totalOpenFindingLinks = 0;

  for (const row of rows) {
    if (row.openFindingCount > 0) {
      controlsWithOpenFindings += 1;
      totalOpenFindingLinks += row.openFindingCount;
    } else {
      controlsWithoutEvidence += 1;
    }
  }

  return {
    frameworkId,
    totalControls: rows.length,
    controlsWithOpenFindings,
    controlsWithoutEvidence,
    totalOpenFindingLinks,
    controls: rows,
  };
}
