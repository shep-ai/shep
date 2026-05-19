/**
 * CreateCampaignUseCase unit tests (feature 098, phase 6, task-38).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { CreateCampaignUseCase } from '@/application/use-cases/aspm/campaigns/create-campaign.js';
import {
  CampaignStatus,
  CanonicalSeverity,
  type RemediationCampaign,
} from '@/domain/generated/output.js';
import type {
  CampaignAuditEntry,
  IRemediationCampaignRepository,
} from '@/application/ports/output/repositories/remediation-campaign-repository.interface.js';
import { FakeSlaClock } from '../../../helpers/aspm/fake-sla-clock.js';

class FakeCampaignRepo implements IRemediationCampaignRepository {
  saved: { campaign: RemediationCampaign; audit: CampaignAuditEntry }[] = [];

  async create(campaign: RemediationCampaign, initialAudit: CampaignAuditEntry): Promise<void> {
    this.saved.push({ campaign, audit: initialAudit });
  }
  async findById() {
    return null;
  }
  async findByIdWithAudit() {
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

describe('CreateCampaignUseCase', () => {
  let repo: FakeCampaignRepo;
  let clock: FakeSlaClock;
  let uc: CreateCampaignUseCase;

  beforeEach(() => {
    repo = new FakeCampaignRepo();
    clock = new FakeSlaClock(new Date('2026-05-19T12:00:00Z'));
    uc = new CreateCampaignUseCase(repo, clock);
  });

  it('persists a Draft campaign with the supplied filter + initial audit entry', async () => {
    const result = await uc.execute({
      name: 'Fix KEV log4j',
      description: 'cross-cutting sprint',
      targetQuery: { severities: [CanonicalSeverity.Critical], kev: true },
      createdBy: 'alice',
    });

    expect(result.status).toBe(CampaignStatus.Draft);
    expect(result.name).toBe('Fix KEV log4j');
    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0].audit.action).toBe('created');
    expect(repo.saved[0].audit.actor).toBe('alice');
    expect(result.createdAt.getTime()).toBe(clock.now().getTime());
  });

  it('honors an explicit Active starting status', async () => {
    const result = await uc.execute({
      name: 'Active sprint',
      description: 'now',
      targetQuery: {},
      createdBy: 'alice',
      status: CampaignStatus.Active,
    });
    expect(result.status).toBe(CampaignStatus.Active);
  });

  it('rejects creating directly in Completed/Cancelled states', async () => {
    await expect(
      uc.execute({
        name: 'x',
        description: '',
        targetQuery: {},
        createdBy: 'a',
        status: CampaignStatus.Completed,
      })
    ).rejects.toThrow(/transition explicitly/);
  });

  it('rejects empty / whitespace name', async () => {
    await expect(
      uc.execute({
        name: '   ',
        description: '',
        targetQuery: {},
        createdBy: 'a',
      })
    ).rejects.toThrow(/name cannot be empty/i);
  });
});
