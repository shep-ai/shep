/**
 * ASPM Entity Type Tests
 *
 * Compile-time + runtime guard that every ASPM TypeSpec entity is exported
 * from packages/core/src/domain/generated/output.ts with the required
 * fields enumerated in feature 098 (FR-3, FR-9, FR-11, FR-16, FR-19, FR-22,
 * FR-29, FR-33).
 *
 * The `Pick<T, K>` assignments below fail to typecheck if any required
 * field is missing from the generated type — making this file a tripwire
 * for accidental TSP regressions during future phases.
 */
import { describe, it, expect } from 'vitest';
import {
  AiSignalState,
  AiSignalType,
  CampaignStatus,
  CanonicalSeverity,
  ComplianceFramework,
  ExceptionReason,
  FindingDomain,
  FindingState,
  RiskExceptionStatus,
  type AiChangeRiskSignal,
  type ApiAsset,
  type BusinessUnit,
  type CloudEnvironment,
  type ComplianceControl,
  type Owner,
  type RemediationCampaign,
  type RiskException,
  type RiskScore,
  type SecurityFinding,
  type SecurityPolicy,
  type Service,
  type Team,
} from '@/domain/generated/output.js';

const UUID_A = '550e8400-e29b-41d4-a716-446655440000';
const UUID_B = '550e8400-e29b-41d4-a716-446655440001';
const TS = '2026-05-19T00:00:00Z';

describe('ASPM entities — Owner / Team / BusinessUnit (FR-3)', () => {
  it('Owner exposes name + (optional) handle + (optional) teamId', () => {
    const owner: Pick<Owner, 'id' | 'createdAt' | 'updatedAt' | 'name'> = {
      id: UUID_A,
      createdAt: TS,
      updatedAt: TS,
      name: 'platform-security',
    };
    expect(owner.name).toBe('platform-security');
  });

  it('Team exposes name', () => {
    const team: Pick<Team, 'name'> = { name: 'core-platform' };
    expect(team.name).toBe('core-platform');
  });

  it('BusinessUnit exposes name', () => {
    const bu: Pick<BusinessUnit, 'name'> = { name: 'payments' };
    expect(bu.name).toBe('payments');
  });
});

describe('ASPM entities — Service / ApiAsset / CloudEnvironment (FR-2)', () => {
  it('Service requires applicationId', () => {
    const service: Pick<Service, 'name' | 'applicationId'> = {
      name: 'payments-worker',
      applicationId: UUID_A,
    };
    expect(service.applicationId).toBe(UUID_A);
  });

  it('ApiAsset requires applicationId', () => {
    const api: Pick<ApiAsset, 'name' | 'applicationId'> = {
      name: 'payments-api',
      applicationId: UUID_A,
    };
    expect(api.applicationId).toBe(UUID_A);
  });

  it('CloudEnvironment requires provider + applicationId', () => {
    const env: Pick<CloudEnvironment, 'name' | 'provider' | 'applicationId'> = {
      name: 'payments-prod',
      provider: 'aws',
      applicationId: UUID_A,
    };
    expect(env.provider).toBe('aws');
  });
});

describe('ASPM entities — SecurityFinding (FR-9)', () => {
  it('exposes the full required field set', () => {
    const finding: Pick<
      SecurityFinding,
      | 'applicationId'
      | 'findingDomain'
      | 'ruleId'
      | 'title'
      | 'description'
      | 'rawSeverity'
      | 'canonicalSeverity'
      | 'state'
      | 'source'
      | 'discoveredAt'
      | 'lastSeenAt'
    > = {
      applicationId: UUID_A,
      findingDomain: FindingDomain.Code,
      ruleId: 'semgrep.rule.id',
      title: 'XSS in template',
      description: 'Unescaped variable in handlebars template',
      rawSeverity: 'HIGH',
      canonicalSeverity: CanonicalSeverity.High,
      state: FindingState.Open,
      source: 'sarif:semgrep',
      discoveredAt: TS,
      lastSeenAt: TS,
    };
    expect(finding.findingDomain).toBe('Code');
    expect(finding.canonicalSeverity).toBe('High');
    expect(finding.state).toBe('Open');
  });

  it('accepts the optional adjacent-asset references', () => {
    const finding: Pick<
      SecurityFinding,
      | 'serviceId'
      | 'apiAssetId'
      | 'cloudEnvironmentId'
      | 'cveId'
      | 'cweId'
      | 'owaspAsvsControlId'
      | 'ownerId'
      | 'workItemId'
      | 'currentRiskScoreId'
    > = {
      serviceId: UUID_B,
      apiAssetId: UUID_B,
      cloudEnvironmentId: UUID_B,
      cveId: 'CVE-2024-12345',
      cweId: 'CWE-79',
      owaspAsvsControlId: 'V2.1.1',
      ownerId: UUID_A,
      workItemId: UUID_B,
      currentRiskScoreId: UUID_B,
    };
    expect(finding.cveId).toBe('CVE-2024-12345');
  });
});

describe('ASPM entities — RiskScore (FR-11)', () => {
  it('exposes total + breakdown + computedAt + inputsHash', () => {
    const score: Pick<
      RiskScore,
      'findingId' | 'total' | 'breakdown' | 'computedAt' | 'inputsHash'
    > = {
      findingId: UUID_A,
      total: 87,
      breakdown: {
        total: 87,
        cvssContribution: 30,
        epssContribution: 15,
        kevContribution: 20,
        exposureContribution: 10,
        criticalityContribution: 7,
        dataClassificationContribution: 5,
      },
      computedAt: TS,
      inputsHash: 'sha256:deadbeef',
    };
    expect(score.total).toBe(87);
    expect(score.breakdown.kevContribution).toBe(20);
  });
});

describe('ASPM entities — RemediationCampaign (FR-16)', () => {
  it('exposes name + targetQuery + status', () => {
    const campaign: Pick<RemediationCampaign, 'name' | 'description' | 'targetQuery' | 'status'> = {
      name: 'Fix all KEV-listed criticals',
      description: 'Sprint 26 fleet-wide cleanup',
      targetQuery: { kev: true, severities: [CanonicalSeverity.Critical] },
      status: CampaignStatus.Active,
    };
    expect(campaign.status).toBe('Active');
    expect(campaign.targetQuery.kev).toBe(true);
  });
});

describe('ASPM entities — SecurityPolicy (FR-19)', () => {
  it('exposes name + active + slaWindows + maxIngestBytes', () => {
    const policy: Pick<SecurityPolicy, 'name' | 'active' | 'slaWindows' | 'maxIngestBytes'> = {
      name: 'default',
      active: true,
      slaWindows: [
        { severity: CanonicalSeverity.Critical, windowDays: 7 },
        { severity: CanonicalSeverity.High, windowDays: 30 },
        { severity: CanonicalSeverity.Medium, windowDays: 90 },
        { severity: CanonicalSeverity.Low, windowDays: 180 },
      ],
      maxIngestBytes: BigInt(100 * 1024 * 1024),
    };
    expect(policy.slaWindows).toHaveLength(4);
    expect(policy.active).toBe(true);
  });
});

describe('ASPM entities — RiskException (FR-22)', () => {
  it('exposes findingId + typed reason + justification + expiry + status', () => {
    const exc: Pick<
      RiskException,
      | 'findingId'
      | 'reason'
      | 'justification'
      | 'declaredBy'
      | 'declaredAt'
      | 'expiresAt'
      | 'status'
    > = {
      findingId: UUID_A,
      reason: ExceptionReason.FalsePositive,
      justification: 'Scanner mis-tags this template helper as XSS',
      declaredBy: UUID_B,
      declaredAt: TS,
      expiresAt: '2026-08-19T00:00:00Z',
      status: RiskExceptionStatus.Active,
    };
    expect(exc.reason).toBe('FalsePositive');
    expect(exc.status).toBe('Active');
  });
});

describe('ASPM entities — ComplianceControl (FR-33)', () => {
  it('exposes frameworkId + controlId + title + description', () => {
    const control: Pick<ComplianceControl, 'frameworkId' | 'controlId' | 'title' | 'description'> =
      {
        frameworkId: ComplianceFramework.OwaspAsvs,
        controlId: 'V2.1.1',
        title: 'Password security requirements',
        description: 'Verify that user-set passwords are at least 12 characters in length',
      };
    expect(control.frameworkId).toBe('OwaspAsvs');
    expect(control.controlId).toBe('V2.1.1');
  });
});

describe('ASPM entities — AiChangeRiskSignal (FR-29)', () => {
  it('exposes applicationId + signalType + severity + summary + state + discoveredAt', () => {
    const signal: Pick<
      AiChangeRiskSignal,
      'applicationId' | 'signalType' | 'severity' | 'summary' | 'state' | 'discoveredAt'
    > = {
      applicationId: UUID_A,
      signalType: AiSignalType.SecretInDiff,
      severity: CanonicalSeverity.Critical,
      summary: 'AWS access key leaked in agent diff',
      state: AiSignalState.Open,
      discoveredAt: TS,
    };
    expect(signal.signalType).toBe('SecretInDiff');
    expect(signal.state).toBe('Open');
  });
});
