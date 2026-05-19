/**
 * ListOwnerRollupsUseCase unit tests (feature 098, phase 7, task-48).
 */

import 'reflect-metadata';
import { describe, expect, it } from 'vitest';

import { ListOwnerRollupsUseCase } from '@/application/use-cases/aspm/ownership/list-owner-rollups.js';
import {
  CanonicalSeverity,
  type BusinessUnit,
  type Owner,
  type Team,
} from '@/domain/generated/output.js';
import type { IOwnerRepository } from '@/application/ports/output/repositories/owner-repository.interface.js';
import type { ITeamRepository } from '@/application/ports/output/repositories/team-repository.interface.js';
import type { IBusinessUnitRepository } from '@/application/ports/output/repositories/business-unit-repository.interface.js';
import type {
  IFindingRepository,
  SeverityCount,
} from '@/application/ports/output/repositories/finding-repository.interface.js';
import type { FindingFilter } from '@/domain/generated/output.js';

const NOW = new Date('2026-05-19T00:00:00.000Z');

function makeOwner(overrides: Partial<Owner>): Owner {
  return {
    id: 'o-1',
    name: 'Alice',
    handle: 'alice@acme.io',
    teamId: 't-1',
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as unknown as Owner;
}

function fakeOwners(items: Owner[]): IOwnerRepository {
  return {
    listAll: async () => items,
  } as unknown as IOwnerRepository;
}

function fakeTeams(items: Team[]): ITeamRepository {
  return {
    listAll: async () => items,
  } as unknown as ITeamRepository;
}

function fakeBUs(items: BusinessUnit[]): IBusinessUnitRepository {
  return {
    listAll: async () => items,
  } as unknown as IBusinessUnitRepository;
}

function fakeFindings(perOwner: Map<string, SeverityCount[]>): IFindingRepository {
  return {
    countOpenBySeverity: async (filter: FindingFilter | undefined) => {
      if (!filter?.ownerIds) return [];
      const ownerId = filter.ownerIds[0];
      return perOwner.get(ownerId) ?? [];
    },
  } as unknown as IFindingRepository;
}

describe('ListOwnerRollupsUseCase', () => {
  it('joins owner → team → BU and rolls up open findings', async () => {
    const owner = makeOwner({ id: 'o-1' });
    const team: Team = {
      id: 't-1',
      name: 'Payments',
      businessUnitId: 'bu-1',
      createdAt: NOW,
      updatedAt: NOW,
    } as unknown as Team;
    const bu: BusinessUnit = {
      id: 'bu-1',
      name: 'Commerce',
      createdAt: NOW,
      updatedAt: NOW,
    } as unknown as BusinessUnit;
    const findings = new Map<string, SeverityCount[]>([
      [
        'o-1',
        [
          { severity: CanonicalSeverity.Critical, count: 1 },
          { severity: CanonicalSeverity.High, count: 2 },
        ],
      ],
    ]);

    const uc = new ListOwnerRollupsUseCase(
      fakeOwners([owner]),
      fakeTeams([team]),
      fakeBUs([bu]),
      fakeFindings(findings)
    );
    const rollups = await uc.execute();

    expect(rollups).toHaveLength(1);
    expect(rollups[0].ownerId).toBe('o-1');
    expect(rollups[0].teamName).toBe('Payments');
    expect(rollups[0].businessUnitName).toBe('Commerce');
    expect(rollups[0].openFindingCount).toBe(3);
    // Zero-filled to all 5 severities
    expect(rollups[0].severityCounts).toHaveLength(5);
  });

  it('handles owners without team or business unit gracefully', async () => {
    const owner = makeOwner({ id: 'o-2', teamId: undefined });
    const uc = new ListOwnerRollupsUseCase(
      fakeOwners([owner]),
      fakeTeams([]),
      fakeBUs([]),
      fakeFindings(new Map())
    );
    const rollups = await uc.execute();
    expect(rollups[0].teamName).toBeUndefined();
    expect(rollups[0].businessUnitName).toBeUndefined();
  });
});
