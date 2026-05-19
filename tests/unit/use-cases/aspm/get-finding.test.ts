/**
 * GetFindingUseCase unit tests (feature 098, phase 3).
 */

import { describe, it, expect, vi } from 'vitest';
import 'reflect-metadata';

import { GetFindingUseCase } from '@/application/use-cases/aspm/findings/get-finding.js';
import { FindingNotFoundError } from '@/domain/aspm/errors/finding-not-found.error.js';
import {
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  type SecurityFinding,
} from '@/domain/generated/output.js';
import type { IFindingRepository } from '@/application/ports/output/repositories/finding-repository.interface.js';

const sample: SecurityFinding = {
  id: 'f-1',
  applicationId: 'app-1',
  findingDomain: FindingDomain.Code,
  ruleId: 'r-1',
  title: 'Title',
  description: 'desc',
  rawSeverity: 'HIGH',
  canonicalSeverity: CanonicalSeverity.High,
  state: FindingState.Open,
  source: 'sarif:semgrep',
  discoveredAt: new Date(),
  lastSeenAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
} as SecurityFinding;

describe('GetFindingUseCase', () => {
  it('returns the finding when present', async () => {
    const repo: IFindingRepository = {
      findById: vi.fn().mockResolvedValue(sample),
    } as unknown as IFindingRepository;
    const uc = new GetFindingUseCase(repo);
    await expect(uc.execute({ id: 'f-1' })).resolves.toEqual(sample);
  });

  it('throws FindingNotFoundError when missing', async () => {
    const repo: IFindingRepository = {
      findById: vi.fn().mockResolvedValue(null),
    } as unknown as IFindingRepository;
    const uc = new GetFindingUseCase(repo);
    await expect(uc.execute({ id: 'missing' })).rejects.toBeInstanceOf(FindingNotFoundError);
  });
});
