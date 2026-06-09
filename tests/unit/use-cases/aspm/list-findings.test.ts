/**
 * ListFindingsUseCase unit tests (feature 098, phase 3).
 */

import { describe, it, expect, vi } from 'vitest';
import 'reflect-metadata';

import { ListFindingsUseCase } from '@/application/use-cases/aspm/findings/list-findings.js';
import { CanonicalSeverity, FindingDomain } from '@/domain/generated/output.js';
import type { IFindingRepository } from '@/application/ports/output/repositories/finding-repository.interface.js';

function fakeRepo(): {
  port: IFindingRepository;
  listMock: ReturnType<typeof vi.fn>;
} {
  const listMock = vi.fn().mockResolvedValue({ items: [], total: 0 });
  return {
    port: { list: listMock } as unknown as IFindingRepository,
    listMock,
  };
}

describe('ListFindingsUseCase', () => {
  it('uses default cursor when none provided', async () => {
    const { port, listMock } = fakeRepo();
    const uc = new ListFindingsUseCase(port);
    const result = await uc.execute();
    expect(listMock).toHaveBeenCalledWith({}, { offset: 0, limit: 25 });
    expect(result.offset).toBe(0);
    expect(result.limit).toBe(25);
  });

  it('clamps limit to MAX_LIMIT (200) when requested above the cap', async () => {
    const { port, listMock } = fakeRepo();
    const uc = new ListFindingsUseCase(port);
    await uc.execute({ cursor: { limit: 999 } });
    expect(listMock).toHaveBeenCalledWith({}, { offset: 0, limit: 200 });
  });

  it('clamps negative offsets to zero', async () => {
    const { port, listMock } = fakeRepo();
    const uc = new ListFindingsUseCase(port);
    await uc.execute({ cursor: { offset: -50 } });
    expect(listMock).toHaveBeenCalledWith({}, { offset: 0, limit: 25 });
  });

  it('passes the filter primitive through unchanged', async () => {
    const { port, listMock } = fakeRepo();
    const uc = new ListFindingsUseCase(port);
    const filter = {
      severities: [CanonicalSeverity.Critical, CanonicalSeverity.High],
      findingDomains: [FindingDomain.Dependency],
      ownerIds: ['owner-1'],
      ruleIds: ['rule-a'],
    };
    await uc.execute({ filter });
    expect(listMock).toHaveBeenCalledWith(filter, { offset: 0, limit: 25 });
  });

  it('echoes the cursor values back on the result', async () => {
    const { port } = fakeRepo();
    const uc = new ListFindingsUseCase(port);
    const result = await uc.execute({ cursor: { offset: 50, limit: 10 } });
    expect(result.offset).toBe(50);
    expect(result.limit).toBe(10);
  });
});
