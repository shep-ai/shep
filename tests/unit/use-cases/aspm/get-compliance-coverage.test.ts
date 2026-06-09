/**
 * GetComplianceCoverageUseCase unit tests (feature 098, phase 9 / task-54).
 *
 * Asserts the coverage math:
 *  - Defaults to OWASP ASVS + CWE Top 25.
 *  - Per-framework totals sum correctly.
 *  - Controls without open findings are classified as "covered without evidence".
 *  - Per-control rows preserve repository ordering.
 *  - Custom framework selection is honored.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import {
  GetComplianceCoverageUseCase,
  buildFrameworkCoverage,
} from '@/application/use-cases/aspm/compliance/get-compliance-coverage.js';
import { ComplianceFramework } from '@/domain/generated/output.js';
import type {
  ComplianceCoverageRow,
  IComplianceControlRepository,
} from '@/application/ports/output/repositories/compliance-control-repository.interface.js';

function fakeRepo(
  perFramework: Record<ComplianceFramework, ComplianceCoverageRow[]>
): IComplianceControlRepository {
  return {
    findById: vi.fn(),
    findByFramework: vi.fn(),
    findIdByControlIdentifier: vi.fn(),
    linkToFinding: vi.fn(),
    linkManyToFinding: vi.fn(),
    findControlsForFinding: vi.fn(),
    getCoverageForFramework: vi
      .fn()
      .mockImplementation(async (id: ComplianceFramework) => perFramework[id] ?? []),
  } as unknown as IComplianceControlRepository;
}

function row(controlIdentifier: string, openFindingCount: number): ComplianceCoverageRow {
  return {
    controlId: `cc-${controlIdentifier.toLowerCase().replace(/\./g, '-')}`,
    controlIdentifier,
    title: `Title for ${controlIdentifier}`,
    openFindingCount,
  };
}

describe('GetComplianceCoverageUseCase', () => {
  it('defaults to OWASP ASVS + CWE Top 25 frameworks', async () => {
    const repo = fakeRepo({
      [ComplianceFramework.OwaspAsvs]: [row('V5.3.4', 2), row('V2.1.1', 0)],
      [ComplianceFramework.CweTop25]: [row('CWE-89', 5), row('CWE-79', 1), row('CWE-22', 0)],
    });
    const uc = new GetComplianceCoverageUseCase(repo);

    const result = await uc.execute();
    expect(result.frameworks.map((f) => f.frameworkId)).toEqual([
      ComplianceFramework.OwaspAsvs,
      ComplianceFramework.CweTop25,
    ]);
  });

  it('computes per-framework totals (covered, with-open, without-evidence)', async () => {
    const repo = fakeRepo({
      [ComplianceFramework.OwaspAsvs]: [row('V5.3.4', 2), row('V2.1.1', 0), row('V1.2.3', 3)],
      [ComplianceFramework.CweTop25]: [],
    });
    const uc = new GetComplianceCoverageUseCase(repo);

    const result = await uc.execute({ frameworks: [ComplianceFramework.OwaspAsvs] });
    const asvs = result.frameworks[0]!;
    expect(asvs.totalControls).toBe(3);
    expect(asvs.controlsWithOpenFindings).toBe(2);
    expect(asvs.controlsWithoutEvidence).toBe(1);
    expect(asvs.totalOpenFindingLinks).toBe(5);
  });

  it('returns zeroed totals when the framework has no controls', async () => {
    const repo = fakeRepo({
      [ComplianceFramework.OwaspAsvs]: [],
      [ComplianceFramework.CweTop25]: [],
    });
    const uc = new GetComplianceCoverageUseCase(repo);

    const result = await uc.execute();
    for (const f of result.frameworks) {
      expect(f.totalControls).toBe(0);
      expect(f.controlsWithOpenFindings).toBe(0);
      expect(f.controlsWithoutEvidence).toBe(0);
      expect(f.totalOpenFindingLinks).toBe(0);
      expect(f.controls).toEqual([]);
    }
  });

  it('preserves the order returned by the repository', async () => {
    const repo = fakeRepo({
      [ComplianceFramework.OwaspAsvs]: [],
      [ComplianceFramework.CweTop25]: [row('CWE-22', 0), row('CWE-79', 3), row('CWE-89', 1)],
    });
    const uc = new GetComplianceCoverageUseCase(repo);

    const result = await uc.execute({ frameworks: [ComplianceFramework.CweTop25] });
    expect(result.frameworks[0]!.controls.map((c) => c.controlIdentifier)).toEqual([
      'CWE-22',
      'CWE-79',
      'CWE-89',
    ]);
  });

  it('honors a custom framework selection', async () => {
    const repo = fakeRepo({
      [ComplianceFramework.OwaspAsvs]: [row('V5.3.4', 2)],
      [ComplianceFramework.CweTop25]: [row('CWE-89', 1)],
    });
    const uc = new GetComplianceCoverageUseCase(repo);

    const result = await uc.execute({ frameworks: [ComplianceFramework.CweTop25] });
    expect(result.frameworks).toHaveLength(1);
    expect(result.frameworks[0]!.frameworkId).toBe(ComplianceFramework.CweTop25);
  });

  describe('buildFrameworkCoverage helper', () => {
    it('classifies rows correctly', () => {
      const coverage = buildFrameworkCoverage(ComplianceFramework.CweTop25, [
        row('CWE-89', 4),
        row('CWE-79', 0),
        row('CWE-22', 7),
      ]);
      expect(coverage.totalControls).toBe(3);
      expect(coverage.controlsWithOpenFindings).toBe(2);
      expect(coverage.controlsWithoutEvidence).toBe(1);
      expect(coverage.totalOpenFindingLinks).toBe(11);
    });
  });
});
