/**
 * BulkConvertFindingsUseCase unit tests (feature 098, phase 7, task-45).
 */

import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';

import { BulkConvertFindingsUseCase } from '@/application/use-cases/aspm/findings/bulk-convert-findings.js';
import { type ConvertFindingToWorkItemUseCase } from '@/application/use-cases/aspm/findings/convert-finding-to-work-item.js';
import {
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  type SecurityFinding,
  type WorkItem,
} from '@/domain/generated/output.js';
import type {
  IFindingRepository,
  ListFindingsCursor,
} from '@/application/ports/output/repositories/finding-repository.interface.js';
import type { FindingFilter } from '@/domain/generated/output.js';

const NOW = new Date('2026-05-19T00:00:00.000Z');

function makeFinding(id: string, workItemId?: string): SecurityFinding {
  return {
    id,
    applicationId: 'app-1',
    findingDomain: FindingDomain.Code,
    ruleId: `rule.${id}`,
    title: `Finding ${id}`,
    description: '',
    rawSeverity: 'HIGH',
    canonicalSeverity: CanonicalSeverity.High,
    state: FindingState.Open,
    source: 'sarif:test',
    discoveredAt: NOW,
    lastSeenAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    workItemId,
  } as SecurityFinding;
}

function fakeFindingRepo(items: SecurityFinding[]): IFindingRepository {
  return {
    list: async () => ({ items, total: items.length }),
  } as unknown as IFindingRepository;
}

describe('BulkConvertFindingsUseCase', () => {
  it('creates a WorkItem per finding and reports counts', async () => {
    const findings = [makeFinding('f-1'), makeFinding('f-2'), makeFinding('f-3')];
    const convert = {
      execute: vi.fn(async ({ findingId }: { findingId: string }) => ({
        finding: findings.find((f) => f.id === findingId)!,
        workItem: { id: `wi-${findingId}` } as WorkItem,
        alreadyLinked: false,
      })),
    } as unknown as ConvertFindingToWorkItemUseCase;

    const uc = new BulkConvertFindingsUseCase(fakeFindingRepo(findings), convert);
    const result = await uc.execute({ filter: {}, projectId: 'proj-1' });

    expect(result.totalMatched).toBe(3);
    expect(result.created).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.failures).toEqual([]);
  });

  it('is idempotent — already-linked findings are skipped not duplicated', async () => {
    const findings = [makeFinding('f-1', 'wi-existing'), makeFinding('f-2')];
    const convert = {
      execute: vi.fn(async ({ findingId }: { findingId: string }) => {
        const f = findings.find((x) => x.id === findingId)!;
        if (f.workItemId !== undefined) {
          return {
            finding: f,
            workItem: { id: f.workItemId } as WorkItem,
            alreadyLinked: true,
          };
        }
        return {
          finding: f,
          workItem: { id: `wi-${findingId}` } as WorkItem,
          alreadyLinked: false,
        };
      }),
    } as unknown as ConvertFindingToWorkItemUseCase;

    const uc = new BulkConvertFindingsUseCase(fakeFindingRepo(findings), convert);
    const result = await uc.execute({ filter: {}, projectId: 'proj-1' });

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
  });

  it('one failure does not abort the batch — the remainder succeeds', async () => {
    const findings = [makeFinding('f-1'), makeFinding('f-2'), makeFinding('f-3')];
    const convert = {
      execute: vi.fn(async ({ findingId }: { findingId: string }) => {
        if (findingId === 'f-2') throw new Error('boom');
        return {
          finding: findings.find((f) => f.id === findingId)!,
          workItem: { id: `wi-${findingId}` } as WorkItem,
          alreadyLinked: false,
        };
      }),
    } as unknown as ConvertFindingToWorkItemUseCase;

    const uc = new BulkConvertFindingsUseCase(fakeFindingRepo(findings), convert);
    const result = await uc.execute({ filter: {}, projectId: 'proj-1' });

    expect(result.created).toBe(2);
    expect(result.failures).toEqual([{ findingId: 'f-2', error: 'boom' }]);
  });

  it('caps batch size to maxFindings default 500', async () => {
    let receivedLimit = -1;
    const repo: IFindingRepository = {
      list: async (_filter: FindingFilter, cursor: ListFindingsCursor) => {
        receivedLimit = cursor.limit;
        return { items: [], total: 0 };
      },
    } as unknown as IFindingRepository;
    const convert = { execute: vi.fn() } as unknown as ConvertFindingToWorkItemUseCase;
    const uc = new BulkConvertFindingsUseCase(repo, convert);
    await uc.execute({ filter: {}, projectId: 'proj-1' });
    expect(receivedLimit).toBe(500);
  });
});
