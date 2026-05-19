/**
 * IngestFindingsUseCase unit tests (feature 098, phase 3).
 *
 * Mocks every port so the test focuses on orchestration:
 *  - rejects when the Application doesn't exist
 *  - resolves ownership via .shep/ownership.yaml when present
 *  - inserts each draft once, intra-batch duplicates are filtered
 *  - re-ingesting an identical document is a no-op on the dedup key
 *  - the redactor masks secrets in description / scannerRaw
 *  - the result summary carries the document hash + duration + tool name
 */

import { describe, it, expect, vi } from 'vitest';
import 'reflect-metadata';

import { IngestFindingsUseCase } from '@/application/use-cases/aspm/findings/ingest-findings.js';
import { ApplicationNotFoundError } from '@/domain/errors/application-not-found.error.js';
import {
  CanonicalSeverity,
  FindingDomain,
  type Application,
  type SecurityFinding,
} from '@/domain/generated/output.js';
import type {
  FindingDraft,
  IFindingIngestPort,
} from '@/application/ports/output/services/finding-ingest-port.interface.js';
import type { IFindingRepository } from '@/application/ports/output/repositories/finding-repository.interface.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IOwnershipYamlReader } from '@/application/ports/output/services/ownership-yaml-reader.interface.js';

function fakeAppRepo(app: Partial<Application> | null): IApplicationRepository {
  const value =
    app === null
      ? null
      : ({
          id: 'app-1',
          repositoryPath: '/repo',
          ...app,
        } as Application);
  return {
    findById: vi.fn().mockResolvedValue(value),
  } as unknown as IApplicationRepository;
}

function fakeFindingRepo(): {
  port: IFindingRepository;
  inserted: SecurityFinding[];
} {
  const persisted = new Set<string>();
  const inserted: SecurityFinding[] = [];
  const port: Partial<IFindingRepository> = {
    bulkInsertOrIgnore: vi.fn().mockImplementation(async (rows: SecurityFinding[]) => {
      let insCount = 0;
      let dupCount = 0;
      for (const row of rows) {
        const key = [
          row.applicationId,
          row.findingDomain,
          row.ruleId,
          row.locationPath ?? '',
          row.locationLine ?? -1,
          row.cveId ?? '',
        ].join(' ');
        if (persisted.has(key)) {
          dupCount += 1;
        } else {
          persisted.add(key);
          inserted.push(row);
          insCount += 1;
        }
      }
      return { inserted: insCount, duplicates: dupCount };
    }),
  };
  return { port: port as IFindingRepository, inserted };
}

function fakeIngestPort(drafts: FindingDraft[], toolName = 'semgrep'): IFindingIngestPort {
  return {
    parse: vi.fn().mockResolvedValue({
      drafts,
      sourceLabel: `sarif:${toolName}`,
      toolName,
    }),
  };
}

const emptyYamlReader: IOwnershipYamlReader = {
  read: vi.fn().mockResolvedValue({ entries: [] }),
};

function draft(overrides: Partial<FindingDraft> = {}): FindingDraft {
  return {
    ruleId: 'r1',
    title: 'Title',
    description: 'desc',
    findingDomain: FindingDomain.Code,
    locationPath: 'src/a.ts',
    locationLine: 1,
    rawSeverity: 'HIGH',
    canonicalSeverity: CanonicalSeverity.High,
    source: 'sarif:semgrep',
    ...overrides,
  };
}

describe('IngestFindingsUseCase', () => {
  it('throws ApplicationNotFoundError when the app does not exist', async () => {
    const uc = new IngestFindingsUseCase(
      fakeAppRepo(null),
      fakeFindingRepo().port,
      fakeIngestPort([]),
      emptyYamlReader
    );
    await expect(
      uc.execute({ applicationId: 'app-1', sourceType: 'sarif', document: '{}' })
    ).rejects.toBeInstanceOf(ApplicationNotFoundError);
  });

  it('persists every distinct draft from the adapter', async () => {
    const repo = fakeFindingRepo();
    const drafts = [draft({ ruleId: 'r1' }), draft({ ruleId: 'r2' })];
    const uc = new IngestFindingsUseCase(
      fakeAppRepo({}),
      repo.port,
      fakeIngestPort(drafts),
      emptyYamlReader
    );

    const result = await uc.execute({
      applicationId: 'app-1',
      sourceType: 'sarif',
      document: '{"runs":[]}',
    });

    expect(result.inserted).toBe(2);
    expect(result.duplicates).toBe(0);
    expect(result.total).toBe(2);
    expect(repo.inserted).toHaveLength(2);
    expect(repo.inserted[0]!.source).toBe('sarif:semgrep');
  });

  it('re-ingesting the same document is a no-op (deterministic dedup)', async () => {
    const repo = fakeFindingRepo();
    const drafts = [draft({ ruleId: 'r1' })];
    const uc = new IngestFindingsUseCase(
      fakeAppRepo({}),
      repo.port,
      fakeIngestPort(drafts),
      emptyYamlReader
    );
    const args = { applicationId: 'app-1', sourceType: 'sarif' as const, document: '{}' };
    const first = await uc.execute(args);
    const second = await uc.execute(args);
    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(1);
    expect(repo.inserted).toHaveLength(1);
  });

  it('filters intra-batch duplicates before persisting', async () => {
    const repo = fakeFindingRepo();
    const drafts = [
      draft({ ruleId: 'rdup', locationPath: 'a.ts', locationLine: 1 }),
      draft({ ruleId: 'rdup', locationPath: 'a.ts', locationLine: 1 }),
      draft({ ruleId: 'rdup', locationPath: 'a.ts', locationLine: 2 }),
    ];
    const uc = new IngestFindingsUseCase(
      fakeAppRepo({}),
      repo.port,
      fakeIngestPort(drafts),
      emptyYamlReader
    );
    const result = await uc.execute({
      applicationId: 'app-1',
      sourceType: 'sarif',
      document: '{}',
    });
    expect(result.inserted).toBe(2);
    expect(result.duplicates).toBe(1);
    expect(result.total).toBe(3);
  });

  it('redacts secrets in description and scannerRaw before persisting', async () => {
    const repo = fakeFindingRepo();
    const drafts = [
      draft({
        ruleId: 'r-secret',
        description: 'leaked: AKIAIOSFODNN7EXAMPLE',
        scannerRaw: '{"key":"sk-aBcDeFgHiJkLmNoPqRsTuV"}',
      }),
    ];
    const uc = new IngestFindingsUseCase(
      fakeAppRepo({}),
      repo.port,
      fakeIngestPort(drafts),
      emptyYamlReader
    );
    await uc.execute({ applicationId: 'app-1', sourceType: 'sarif', document: '{}' });
    const persisted = repo.inserted[0]!;
    expect(persisted.description).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(persisted.description).toContain('[REDACTED:');
    expect(persisted.scannerRaw).not.toContain('sk-aBcDeFgHiJkLmNoPqRsTuV');
    expect(persisted.scannerRawHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('resolves ownership from ownership.yaml when a pathGlob matches', async () => {
    const repo = fakeFindingRepo();
    const yamlReader: IOwnershipYamlReader = {
      read: vi.fn().mockResolvedValue({
        entries: [{ pathGlob: 'src/api/**', ownerId: 'owner-api', source: 'yaml' as const }],
      }),
    };
    const drafts = [
      draft({ locationPath: 'src/api/users.ts' }),
      draft({ locationPath: 'src/web/x.ts', ruleId: 'r2' }),
    ];
    const uc = new IngestFindingsUseCase(
      fakeAppRepo({ repositoryPath: '/repo' }),
      repo.port,
      fakeIngestPort(drafts),
      yamlReader
    );
    await uc.execute({ applicationId: 'app-1', sourceType: 'sarif', document: '{}' });
    expect(repo.inserted[0]!.ownerId).toBe('owner-api');
    expect(repo.inserted[1]!.ownerId).toBeUndefined();
  });

  it('returns the ingestion-run summary with documentHash + duration + toolName', async () => {
    const repo = fakeFindingRepo();
    const drafts = [draft()];
    const uc = new IngestFindingsUseCase(
      fakeAppRepo({}),
      repo.port,
      fakeIngestPort(drafts, 'codeql'),
      emptyYamlReader
    );
    const result = await uc.execute({
      applicationId: 'app-1',
      sourceType: 'sarif',
      document: 'doc-body',
    });
    expect(result.toolName).toBe('codeql');
    expect(result.sourceLabel).toBe('sarif:codeql');
    expect(result.documentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
