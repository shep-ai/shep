/**
 * ASPM TypeSpec Output Unit Tests
 *
 * Asserts that pnpm tsp:compile produced the full ASPM enum + value-object
 * surface in packages/core/src/domain/generated/output.ts. This is a
 * snapshot-style guard against TSP regressions — a missing enum here means
 * a downstream domain or use-case file will fail to import its type.
 */
import { describe, it, expect } from 'vitest';
import {
  AiSignalState,
  AiSignalType,
  AssetType,
  CampaignStatus,
  CanonicalSeverity,
  ComplianceFramework,
  Criticality,
  DataClassification,
  ExceptionReason,
  Exposure,
  FindingDomain,
  FindingState,
  SlaState,
  type CVEReference,
  type FindingFilter,
  type OwnershipPath,
  type RiskScoreBreakdown,
  type SLAWindow,
} from '@/domain/generated/output.js';

describe('ASPM TypeSpec output — canonical enums', () => {
  it('CanonicalSeverity covers Critical/High/Medium/Low/Info', () => {
    expect(Object.values(CanonicalSeverity)).toEqual(
      expect.arrayContaining(['Critical', 'High', 'Medium', 'Low', 'Info'])
    );
    expect(Object.values(CanonicalSeverity)).toHaveLength(5);
  });

  it('FindingDomain covers all ASPM finding sources', () => {
    expect(Object.values(FindingDomain)).toEqual(
      expect.arrayContaining([
        'Code',
        'Dependency',
        'Secret',
        'Container',
        'Cloud',
        'Api',
        'Identity',
        'Runtime',
        'Compliance',
        'Ai',
      ])
    );
  });

  it('FindingState covers the lifecycle states', () => {
    expect(Object.values(FindingState)).toEqual(
      expect.arrayContaining(['Open', 'Triaged', 'InProgress', 'Resolved', 'Closed', 'Exception'])
    );
  });

  it('ExceptionReason covers the typed reason taxonomy', () => {
    expect(Object.values(ExceptionReason)).toEqual(
      expect.arrayContaining([
        'FalsePositive',
        'AcceptedRisk',
        'CompensatingControl',
        'NotApplicable',
        'Other',
      ])
    );
  });

  it('Exposure covers Internet/Internal/Airgapped/Unknown', () => {
    expect(Object.values(Exposure)).toEqual(
      expect.arrayContaining(['Internet', 'Internal', 'Airgapped', 'Unknown'])
    );
  });

  it('Criticality covers Tier1/Tier2/Tier3', () => {
    expect(Object.values(Criticality)).toEqual(expect.arrayContaining(['Tier1', 'Tier2', 'Tier3']));
  });

  it('DataClassification covers Public/Internal/Confidential/Restricted', () => {
    expect(Object.values(DataClassification)).toEqual(
      expect.arrayContaining(['Public', 'Internal', 'Confidential', 'Restricted'])
    );
  });

  it('SlaState covers Healthy/AtRisk/Breached', () => {
    expect(Object.values(SlaState)).toEqual(
      expect.arrayContaining(['Healthy', 'AtRisk', 'Breached'])
    );
  });

  it('CampaignStatus covers Draft/Active/Paused/Completed/Cancelled', () => {
    expect(Object.values(CampaignStatus)).toEqual(
      expect.arrayContaining(['Draft', 'Active', 'Paused', 'Completed', 'Cancelled'])
    );
  });

  it('AiSignalState covers the AI-review queue lifecycle', () => {
    expect(Object.values(AiSignalState)).toEqual(
      expect.arrayContaining([
        'Open',
        'Acknowledged',
        'GraduatedToFinding',
        'Dismissed',
        'Resolved',
      ])
    );
  });

  it('AiSignalType covers the MVP AI-change signal rules', () => {
    expect(Object.values(AiSignalType)).toEqual(
      expect.arrayContaining([
        'SecretInDiff',
        'HighRiskDependencyAdded',
        'LargeUnreviewedDiff',
        'LicenseViolation',
        'PromptInjectionShape',
        'Other',
      ])
    );
  });

  it('ComplianceFramework covers OWASP ASVS and CWE Top 25', () => {
    expect(Object.values(ComplianceFramework)).toEqual(
      expect.arrayContaining(['OwaspAsvs', 'CweTop25'])
    );
  });

  it('AssetType covers Application + adjacent asset kinds', () => {
    expect(Object.values(AssetType)).toEqual(
      expect.arrayContaining(['Application', 'Service', 'ApiAsset', 'CloudEnvironment'])
    );
  });
});

describe('ASPM TypeSpec output — value objects', () => {
  it('CVEReference accepts a CVE id with optional enrichment fields', () => {
    const ref: CVEReference = {
      cveId: 'CVE-2024-12345',
      cvssScore: 9.8,
      epssPercentile: 0.97,
      kev: true,
    };
    expect(ref.cveId).toBe('CVE-2024-12345');
    expect(ref.kev).toBe(true);
  });

  it('CVEReference allows minimal shape with only cveId', () => {
    const ref: CVEReference = { cveId: 'CVE-2024-00001' };
    expect(ref.cveId).toBe('CVE-2024-00001');
    expect(ref.cvssScore).toBeUndefined();
  });

  it('OwnershipPath carries pathGlob + ownerId + source', () => {
    const path: OwnershipPath = {
      pathGlob: 'packages/payments/**',
      ownerId: '550e8400-e29b-41d4-a716-446655440000',
      source: 'yaml',
    };
    expect(path.pathGlob).toBe('packages/payments/**');
    expect(path.source).toBe('yaml');
  });

  it('SLAWindow pairs a canonical severity with a calendar-day window', () => {
    const window: SLAWindow = { severity: CanonicalSeverity.Critical, windowDays: 7 };
    expect(window.severity).toBe('Critical');
    expect(window.windowDays).toBe(7);
  });

  it('RiskScoreBreakdown carries total + every dimension contribution', () => {
    const breakdown: RiskScoreBreakdown = {
      total: 87,
      cvssContribution: 30,
      epssContribution: 15,
      kevContribution: 20,
      exposureContribution: 10,
      criticalityContribution: 7,
      dataClassificationContribution: 5,
    };
    expect(breakdown.total).toBe(87);
    expect(breakdown.kevContribution).toBe(20);
  });

  it('FindingFilter is fully optional (empty filter = all findings)', () => {
    const empty: FindingFilter = {};
    expect(empty).toEqual({});
  });

  it('FindingFilter accepts the reusable filter dimensions', () => {
    const filter: FindingFilter = {
      severities: [CanonicalSeverity.Critical, CanonicalSeverity.High],
      findingDomains: [FindingDomain.Code, FindingDomain.Dependency],
      applicationIds: ['550e8400-e29b-41d4-a716-446655440000'],
      ownerIds: ['550e8400-e29b-41d4-a716-446655440001'],
      kev: true,
      states: [FindingState.Open, FindingState.Triaged],
      ruleIds: ['semgrep.rule.1'],
      cveIds: ['CVE-2024-12345'],
    };
    expect(filter.severities).toHaveLength(2);
    expect(filter.kev).toBe(true);
  });
});
