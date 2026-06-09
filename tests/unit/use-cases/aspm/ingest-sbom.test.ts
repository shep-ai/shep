/**
 * IngestSbomUseCase unit tests (feature 098, phase 4, task-21).
 *
 *  - rejects when the Application doesn't exist
 *  - shapes vulnerability × component pairs into dependency-domain findings
 *  - re-ingesting the same document is a no-op (deterministic dedup)
 *  - vulnerabilities with multiple affected components emit one finding per ref
 *  - missing-affected-component path still emits a finding (no silent drop)
 */

import { describe, it, expect, vi } from 'vitest';
import 'reflect-metadata';

import { IngestSbomUseCase } from '@/application/use-cases/aspm/findings/ingest-sbom.js';
import { ApplicationNotFoundError } from '@/domain/errors/application-not-found.error.js';
import {
  CanonicalSeverity,
  FindingDomain,
  type Application,
  type SecurityFinding,
} from '@/domain/generated/output.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IFindingRepository } from '@/application/ports/output/repositories/finding-repository.interface.js';
import type { IExploitIntelPort } from '@/application/ports/output/services/exploit-intel-port.interface.js';
import type { IOwnershipYamlReader } from '@/application/ports/output/services/ownership-yaml-reader.interface.js';
import type {
  ISbomPort,
  SbomComponentDraft,
  SbomDraft,
  SbomVulnerabilityDraft,
} from '@/application/ports/output/services/sbom-port.interface.js';

function fakeExploitIntel(
  kevSet = new Set<string>(),
  epssMap = new Map<string, number>()
): IExploitIntelPort {
  return {
    isKev: vi.fn().mockImplementation(async (cveId: string) => kevSet.has(cveId.toUpperCase())),
    getEpssPercentile: vi
      .fn()
      .mockImplementation(async (cveId: string) => epssMap.get(cveId.toUpperCase()) ?? null),
  };
}

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

function fakeSbomPort(draft: SbomDraft): ISbomPort {
  return { parse: vi.fn().mockResolvedValue(draft) };
}

const emptyYamlReader: IOwnershipYamlReader = {
  read: vi.fn().mockResolvedValue({ entries: [] }),
};

function component(overrides: Partial<SbomComponentDraft> = {}): SbomComponentDraft {
  return {
    bomRef: 'pkg:npm/lodash@4.17.20',
    name: 'lodash',
    version: '4.17.20',
    ...overrides,
  };
}

function vuln(overrides: Partial<SbomVulnerabilityDraft> = {}): SbomVulnerabilityDraft {
  return {
    id: 'CVE-2020-8203',
    cveId: 'CVE-2020-8203',
    description: 'prototype pollution',
    canonicalSeverity: CanonicalSeverity.High,
    rawSeverity: 'high',
    affectedComponentRefs: ['pkg:npm/lodash@4.17.20'],
    ...overrides,
  };
}

function sbom(overrides: Partial<SbomDraft> = {}): SbomDraft {
  return {
    components: [component()],
    vulnerabilities: [vuln()],
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    sourceLabel: 'cyclonedx:1.5',
    ...overrides,
  };
}

describe('IngestSbomUseCase', () => {
  it('throws ApplicationNotFoundError when the app does not exist', async () => {
    const uc = new IngestSbomUseCase(
      fakeAppRepo(null),
      fakeFindingRepo().port,
      fakeSbomPort(sbom()),
      emptyYamlReader,
      fakeExploitIntel()
    );
    await expect(uc.execute({ applicationId: 'app-1', document: '{}' })).rejects.toBeInstanceOf(
      ApplicationNotFoundError
    );
  });

  it('persists one dependency-domain finding per vulnerability × affected component', async () => {
    const repo = fakeFindingRepo();
    const uc = new IngestSbomUseCase(
      fakeAppRepo({}),
      repo.port,
      fakeSbomPort(sbom()),
      emptyYamlReader,
      fakeExploitIntel()
    );

    const result = await uc.execute({ applicationId: 'app-1', document: '{}' });

    expect(result.inserted).toBe(1);
    expect(result.duplicates).toBe(0);
    expect(result.total).toBe(1);
    expect(result.componentCount).toBe(1);
    expect(result.sourceLabel).toBe('cyclonedx:1.5');
    expect(repo.inserted).toHaveLength(1);
    const f = repo.inserted[0]!;
    expect(f.findingDomain).toBe(FindingDomain.Dependency);
    expect(f.ruleId).toBe('CVE-2020-8203');
    expect(f.cveId).toBe('CVE-2020-8203');
    expect(f.locationPath).toBe('pkg:npm/lodash@4.17.20');
    expect(f.source).toBe('cyclonedx:1.5');
    expect(f.title).toContain('CVE-2020-8203');
    expect(f.title).toContain('lodash@4.17.20');
  });

  it('emits one finding per affected component when a vuln spans multiple components', async () => {
    const repo = fakeFindingRepo();
    const multi = sbom({
      components: [
        component({ bomRef: 'pkg:npm/a@1', name: 'a', version: '1' }),
        component({ bomRef: 'pkg:npm/b@1', name: 'b', version: '1' }),
      ],
      vulnerabilities: [vuln({ affectedComponentRefs: ['pkg:npm/a@1', 'pkg:npm/b@1'] })],
    });
    const uc = new IngestSbomUseCase(
      fakeAppRepo({}),
      repo.port,
      fakeSbomPort(multi),
      emptyYamlReader,
      fakeExploitIntel()
    );

    const result = await uc.execute({ applicationId: 'app-1', document: '{}' });

    expect(result.inserted).toBe(2);
    expect(repo.inserted.map((f) => f.locationPath).sort()).toEqual(['pkg:npm/a@1', 'pkg:npm/b@1']);
  });

  it('still emits a finding when a vulnerability lists no affected components', async () => {
    const repo = fakeFindingRepo();
    const orphan = sbom({
      components: [],
      vulnerabilities: [vuln({ affectedComponentRefs: [] })],
    });
    const uc = new IngestSbomUseCase(
      fakeAppRepo({}),
      repo.port,
      fakeSbomPort(orphan),
      emptyYamlReader,
      fakeExploitIntel()
    );

    const result = await uc.execute({ applicationId: 'app-1', document: '{}' });
    expect(result.inserted).toBe(1);
    expect(repo.inserted[0]!.locationPath).toBeUndefined();
  });

  it('re-ingesting the same SBOM is a no-op (deterministic dedup)', async () => {
    const repo = fakeFindingRepo();
    const uc = new IngestSbomUseCase(
      fakeAppRepo({}),
      repo.port,
      fakeSbomPort(sbom()),
      emptyYamlReader,
      fakeExploitIntel()
    );
    const first = await uc.execute({ applicationId: 'app-1', document: '{}' });
    const second = await uc.execute({ applicationId: 'app-1', document: '{}' });
    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(1);
    expect(repo.inserted).toHaveLength(1);
  });

  it('filters intra-batch duplicates (same vuln × same component referenced twice)', async () => {
    const repo = fakeFindingRepo();
    const dup = sbom({
      vulnerabilities: [
        vuln({ affectedComponentRefs: ['pkg:npm/lodash@4.17.20', 'pkg:npm/lodash@4.17.20'] }),
      ],
    });
    const uc = new IngestSbomUseCase(
      fakeAppRepo({}),
      repo.port,
      fakeSbomPort(dup),
      emptyYamlReader,
      fakeExploitIntel()
    );
    const result = await uc.execute({ applicationId: 'app-1', document: '{}' });
    expect(result.inserted).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(result.total).toBe(2);
  });

  it('enriches CVE-bearing vulnerabilities with KEV flag + EPSS percentile', async () => {
    const repo = fakeFindingRepo();
    const kev = new Set(['CVE-2021-44228']);
    const epss = new Map([['CVE-2021-44228', 0.99]]);
    const log4shellSbom = sbom({
      components: [
        component({ bomRef: 'pkg:maven/log4j-core@2.14.1', name: 'log4j-core', version: '2.14.1' }),
      ],
      vulnerabilities: [
        vuln({
          id: 'CVE-2021-44228',
          cveId: 'CVE-2021-44228',
          canonicalSeverity: CanonicalSeverity.Critical,
          rawSeverity: 'critical',
          affectedComponentRefs: ['pkg:maven/log4j-core@2.14.1'],
        }),
      ],
    });
    const uc = new IngestSbomUseCase(
      fakeAppRepo({}),
      repo.port,
      fakeSbomPort(log4shellSbom),
      emptyYamlReader,
      fakeExploitIntel(kev, epss)
    );
    await uc.execute({ applicationId: 'app-1', document: '{}' });
    const f = repo.inserted[0]!;
    expect(f.kev).toBe(true);
    expect(f.epssPercentile).toBe(0.99);
  });

  it('returns the ingestion-run summary with documentHash + duration + toolName', async () => {
    const repo = fakeFindingRepo();
    const uc = new IngestSbomUseCase(
      fakeAppRepo({}),
      repo.port,
      fakeSbomPort(sbom({ toolName: 'cdxgen' })),
      emptyYamlReader,
      fakeExploitIntel()
    );
    const result = await uc.execute({ applicationId: 'app-1', document: 'doc-body' });
    expect(result.toolName).toBe('cdxgen');
    expect(result.documentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
