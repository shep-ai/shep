/**
 * GetCampaignProgressUseCase unit tests (feature 098, phase 6, task-38).
 *
 * Verifies the use case re-runs the campaign's targetQuery and correctly
 * counts (total, closed, atRisk, blocked) — including SLA-band computation
 * using the active SecurityPolicy + injected clock.
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { GetCampaignProgressUseCase } from '@/application/use-cases/aspm/campaigns/get-campaign-progress.js';
import {
  CampaignStatus,
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  type FindingFilter,
  type RemediationCampaign,
  type SecurityFinding,
  type SecurityPolicy,
} from '@/domain/generated/output.js';
import type {
  IRemediationCampaignRepository,
  RemediationCampaignWithAudit,
} from '@/application/ports/output/repositories/remediation-campaign-repository.interface.js';
import type {
  IFindingRepository,
  ListFindingsCursor,
  ListFindingsResult,
} from '@/application/ports/output/repositories/finding-repository.interface.js';
import type { ISecurityPolicyRepository } from '@/application/ports/output/repositories/security-policy-repository.interface.js';
import { FakeSlaClock } from '../../../helpers/aspm/fake-sla-clock.js';

const NOW = new Date('2026-05-19T12:00:00Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function policy(): SecurityPolicy {
  return {
    id: 'p',
    name: 'Default',
    active: true,
    slaWindows: [
      { severity: CanonicalSeverity.Critical, windowDays: 7 },
      { severity: CanonicalSeverity.High, windowDays: 30 },
      { severity: CanonicalSeverity.Medium, windowDays: 90 },
      { severity: CanonicalSeverity.Low, windowDays: 180 },
    ],
    maxIngestBytes: BigInt(0),
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function finding(
  state: FindingState,
  ageDays: number,
  severity: CanonicalSeverity = CanonicalSeverity.High
): SecurityFinding {
  const discoveredAt = new Date(NOW.getTime() - ageDays * MS_PER_DAY);
  return {
    id: randomUUID(),
    applicationId: randomUUID(),
    findingDomain: FindingDomain.Code,
    ruleId: 'r',
    title: 't',
    description: 'd',
    rawSeverity: 'high',
    canonicalSeverity: severity,
    state,
    source: 'sarif:test',
    discoveredAt,
    lastSeenAt: discoveredAt,
    createdAt: discoveredAt,
    updatedAt: discoveredAt,
  };
}

class FakeCampaignRepo implements IRemediationCampaignRepository {
  campaign: RemediationCampaign | null = null;
  async create(): Promise<void> {
    return undefined;
  }
  async findById(id: string): Promise<RemediationCampaign | null> {
    return this.campaign && this.campaign.id === id ? this.campaign : null;
  }
  async findByIdWithAudit(): Promise<RemediationCampaignWithAudit | null> {
    return null;
  }
  async list(): Promise<RemediationCampaign[]> {
    return [];
  }
  async update(): Promise<void> {
    return undefined;
  }
  async updateStatus(): Promise<void> {
    return undefined;
  }
  async softDelete(): Promise<void> {
    return undefined;
  }
}

class FakeFindingRepo implements IFindingRepository {
  matchedFindings: SecurityFinding[] = [];
  observedFilter?: FindingFilter;
  observedCursors: ListFindingsCursor[] = [];

  async create(): Promise<void> {
    return undefined;
  }
  async bulkInsertOrIgnore(): Promise<{ inserted: number; duplicates: number }> {
    return { inserted: 0, duplicates: 0 };
  }
  async findById(): Promise<SecurityFinding | null> {
    return null;
  }
  async findIdByDedupTuple(): Promise<string | null> {
    return null;
  }
  async list(filter: FindingFilter, cursor: ListFindingsCursor): Promise<ListFindingsResult> {
    this.observedFilter = filter;
    this.observedCursors.push(cursor);
    const slice = this.matchedFindings.slice(cursor.offset, cursor.offset + cursor.limit);
    return { items: slice, total: this.matchedFindings.length };
  }
  async listRanked() {
    return { items: [], total: 0 };
  }
  async count() {
    return this.matchedFindings.length;
  }
  async update(): Promise<void> {
    return undefined;
  }
  async softDelete(): Promise<void> {
    return undefined;
  }
  // Phase 7 aggregate helpers — unused by campaign-progress tests but
  // satisfy the IFindingRepository contract.
  async countOpenBySeverity() {
    return [];
  }
  async topAtRiskApplications() {
    return [];
  }
  async countOpenKev() {
    return 0;
  }
  async countSlaBreached() {
    return 0;
  }
  async latestLastSeenAt() {
    return null;
  }
  async countOpenBySeverityForApplication() {
    return [];
  }
  async postureTrend() {
    return [];
  }
}

class FakePolicyRepo implements ISecurityPolicyRepository {
  active: SecurityPolicy | null = policy();
  async create(): Promise<void> {
    return undefined;
  }
  async findById() {
    return null;
  }
  async findActive() {
    return this.active;
  }
  async listAll() {
    return [];
  }
  async update(): Promise<void> {
    return undefined;
  }
  async softDelete(): Promise<void> {
    return undefined;
  }
}

describe('GetCampaignProgressUseCase', () => {
  let campaigns: FakeCampaignRepo;
  let findings: FakeFindingRepo;
  let policies: FakePolicyRepo;
  let clock: FakeSlaClock;
  let uc: GetCampaignProgressUseCase;

  beforeEach(() => {
    campaigns = new FakeCampaignRepo();
    findings = new FakeFindingRepo();
    policies = new FakePolicyRepo();
    clock = new FakeSlaClock(NOW);
    uc = new GetCampaignProgressUseCase(campaigns, findings, policies, clock);
  });

  it('counts findings into total/closed/atRisk/blocked using injected policy + clock', async () => {
    const id = randomUUID();
    const filter: FindingFilter = { severities: [CanonicalSeverity.High] };
    campaigns.campaign = {
      id,
      name: 'High sprint',
      description: '',
      targetQuery: filter,
      status: CampaignStatus.Active,
      createdAt: NOW,
      updatedAt: NOW,
    };

    findings.matchedFindings = [
      finding(FindingState.Open, 2), // Healthy → not atRisk
      finding(FindingState.Open, 20), // 20/30 = 66% → AtRisk
      finding(FindingState.Triaged, 35), // Breached
      finding(FindingState.Resolved, 50), // closed
      finding(FindingState.Closed, 60), // closed
      finding(FindingState.Exception, 100), // blocked
    ];

    const result = await uc.execute({ campaignId: id });

    expect(result.progress).toEqual({ total: 6, closed: 2, atRisk: 2, blocked: 1 });
    expect(result.truncated).toBe(false);
    expect(findings.observedFilter).toBe(filter);
  });

  it('throws when the campaign does not exist', async () => {
    await expect(uc.execute({ campaignId: 'missing' })).rejects.toThrow(/not found/i);
  });

  it('throws when no active SecurityPolicy is configured', async () => {
    const id = randomUUID();
    campaigns.campaign = {
      id,
      name: 'x',
      description: '',
      targetQuery: {},
      status: CampaignStatus.Active,
      createdAt: NOW,
      updatedAt: NOW,
    };
    policies.active = null;
    await expect(uc.execute({ campaignId: id })).rejects.toThrow(/No active SecurityPolicy/);
  });

  it('paginates through all matching findings using offset/limit', async () => {
    const id = randomUUID();
    campaigns.campaign = {
      id,
      name: 'big',
      description: '',
      targetQuery: {},
      status: CampaignStatus.Active,
      createdAt: NOW,
      updatedAt: NOW,
    };
    findings.matchedFindings = Array.from({ length: 1200 }, () => finding(FindingState.Open, 1));

    const result = await uc.execute({ campaignId: id });
    expect(result.progress.total).toBe(1200);
    expect(findings.observedCursors.length).toBe(3); // 500 + 500 + 200
  });
});
