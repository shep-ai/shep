/**
 * IngestSbomUseCase integration test (feature 098, phase 4, task-21).
 *
 * Drives the full SBOM ingest path with a real SQLite + real
 * CycloneDxSbomAdapter against the cyclonedx-1.5 fixture, asserting:
 *  - dependency-domain rows land with the expected count + severity
 *  - re-ingesting the same fixture is a no-op (NFR-10)
 */

import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';

import { createInMemoryDatabase } from '../../../../helpers/database.helper.js';
import { runSQLiteMigrations } from '@/infrastructure/persistence/sqlite/migrations.js';
import { SQLiteFindingRepository } from '@/infrastructure/repositories/aspm/sqlite-finding-repository.js';
import { CycloneDxSbomAdapter } from '@/infrastructure/services/aspm/cyclonedx-sbom-adapter.js';
import { IngestSbomUseCase } from '@/application/use-cases/aspm/findings/ingest-sbom.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IExploitIntelPort } from '@/application/ports/output/services/exploit-intel-port.interface.js';
import type { IOwnershipYamlReader } from '@/application/ports/output/services/ownership-yaml-reader.interface.js';
import { CanonicalSeverity, FindingDomain } from '@/domain/generated/output.js';

const kevSet = new Set<string>(['CVE-2021-44228']);
const epssMap = new Map<string, number>([
  ['CVE-2021-44228', 0.9995],
  ['CVE-2020-8203', 0.85501],
]);

const fixtureExploitIntel: IExploitIntelPort = {
  isKev: vi.fn().mockImplementation(async (cveId: string) => kevSet.has(cveId.toUpperCase())),
  getEpssPercentile: vi
    .fn()
    .mockImplementation(async (cveId: string) => epssMap.get(cveId.toUpperCase()) ?? null),
};

const fixturesDir = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../fixtures/aspm/sbom'
);

const fakeAppRepo: IApplicationRepository = {
  findById: vi.fn().mockResolvedValue({ id: 'app-1', repositoryPath: '/repo' }),
} as unknown as IApplicationRepository;

const emptyYamlReader: IOwnershipYamlReader = {
  read: vi.fn().mockResolvedValue({ entries: [] }),
};

describe('IngestSbomUseCase + CycloneDxSbomAdapter (integration)', () => {
  let db: Database.Database;
  let repo: SQLiteFindingRepository;
  let uc: IngestSbomUseCase;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteFindingRepository(db);
    uc = new IngestSbomUseCase(
      fakeAppRepo,
      repo,
      new CycloneDxSbomAdapter(),
      emptyYamlReader,
      fixtureExploitIntel
    );
  });

  afterEach(() => {
    db.close();
  });

  it('ingests the CycloneDX 1.5 fixture into dependency-domain findings', async () => {
    const doc = readFileSync(join(fixturesDir, 'cyclonedx-1.5-sample.json'), 'utf-8');
    const result = await uc.execute({ applicationId: 'app-1', document: doc });

    expect(result.inserted).toBe(3);
    expect(result.componentCount).toBe(3);
    expect(result.sourceLabel).toBe('cyclonedx:1.5');

    const stored = await repo.list({}, { offset: 0, limit: 25 });
    expect(stored.total).toBe(3);
    for (const f of stored.items) {
      expect(f.findingDomain).toBe(FindingDomain.Dependency);
    }
    const log4shell = stored.items.find((f) => f.cveId === 'CVE-2021-44228')!;
    expect(log4shell).toBeDefined();
    expect(log4shell.canonicalSeverity).toBe(CanonicalSeverity.Critical);
    expect(log4shell.locationPath).toBe('pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1');

    // KEV/EPSS enrichment (task-23): the KEV-listed CVE-2021-44228 carries kev=true,
    // and the EPSS lookup populates a percentile. Non-CVE rows are not enriched.
    expect(log4shell.kev).toBe(true);
    expect(log4shell.epssPercentile).toBe(0.9995);
    const lodash = stored.items.find((f) => f.cveId === 'CVE-2020-8203')!;
    expect(lodash.kev).toBe(false);
    expect(lodash.epssPercentile).toBe(0.85501);
    const ghsa = stored.items.find((f) => f.ruleId === 'GHSA-3xpr-x77f-jh43')!;
    expect(ghsa.kev).toBeUndefined();
    expect(ghsa.epssPercentile).toBeUndefined();
  });

  it('re-ingesting the same SBOM is a no-op (NFR-10)', async () => {
    const doc = readFileSync(join(fixturesDir, 'cyclonedx-1.5-sample.json'), 'utf-8');
    const first = await uc.execute({ applicationId: 'app-1', document: doc });
    const second = await uc.execute({ applicationId: 'app-1', document: doc });
    expect(first.inserted).toBe(3);
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(3);
    const stored = await repo.list({}, { offset: 0, limit: 25 });
    expect(stored.total).toBe(3);
  });
});
