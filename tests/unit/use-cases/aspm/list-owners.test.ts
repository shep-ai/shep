/**
 * ListOwnersUseCase tests (feature 098, phase 2).
 */

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { IOwnerRepository } from '@/application/ports/output/repositories/owner-repository.interface.js';
import type { Owner } from '@/domain/generated/output.js';
import { ListOwnersUseCase } from '@/application/use-cases/aspm/ownership/list-owners.js';

function ownerFixture(overrides: Partial<Owner> = {}): Owner {
  const now = new Date();
  return {
    id: 'o-1',
    name: 'Alice',
    handle: 'a@x.com',
    teamId: undefined,
    notes: undefined,
    createdAt: now,
    updatedAt: now,
    deletedAt: undefined,
    ...overrides,
  };
}

describe('ListOwnersUseCase', () => {
  let repo: IOwnerRepository;
  let uc: ListOwnersUseCase;

  beforeEach(() => {
    repo = {
      create: vi.fn(),
      findById: vi.fn(),
      findByHandle: vi.fn(),
      listAll: vi.fn(),
      listByTeam: vi.fn(),
      update: vi.fn(),
      softDelete: vi.fn(),
    };
    uc = new ListOwnersUseCase(repo);
  });

  it('delegates to repository.listAll when no teamId is provided', async () => {
    const owners = [ownerFixture(), ownerFixture({ id: 'o-2', name: 'Bob', handle: 'b@x.com' })];
    (repo.listAll as ReturnType<typeof vi.fn>).mockResolvedValue(owners);
    const result = await uc.execute();
    expect(result).toEqual(owners);
    expect(repo.listAll).toHaveBeenCalled();
    expect(repo.listByTeam).not.toHaveBeenCalled();
  });

  it('delegates to repository.listByTeam when a teamId is provided', async () => {
    const owners = [ownerFixture({ teamId: 't-1' })];
    (repo.listByTeam as ReturnType<typeof vi.fn>).mockResolvedValue(owners);
    const result = await uc.execute({ teamId: 't-1' });
    expect(result).toEqual(owners);
    expect(repo.listByTeam).toHaveBeenCalledWith('t-1');
    expect(repo.listAll).not.toHaveBeenCalled();
  });
});
