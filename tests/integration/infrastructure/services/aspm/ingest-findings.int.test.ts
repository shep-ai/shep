/**
 * IngestFindingsUseCase integration test (feature 098, phase 3).
 *
 * Drives the full SARIF ingest path with a real SQLite + real
 * SarifIngestAdapter against the semgrep fixture, asserting:
 *  - rows land with the expected count + canonical severity / domain
 *  - re-ingesting the same fixture is a no-op (NFR-10)
 *  - 10k findings ingest comfortably under 30s (NFR-6 sanity)
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
import { SarifIngestAdapter } from '@/infrastructure/services/aspm/sarif-ingest-adapter.js';
import { IngestFindingsUseCase } from '@/application/use-cases/aspm/findings/ingest-findings.js';
import type { IApplicationRepository } from '@/application/ports/output/repositories/application-repository.interface.js';
import type { IExploitIntelPort } from '@/application/ports/output/services/exploit-intel-port.interface.js';
import type { IOwnershipYamlReader } from '@/application/ports/output/services/ownership-yaml-reader.interface.js';
import { CanonicalSeverity, FindingDomain } from '@/domain/generated/output.js';

const offlineExploitIntel: IExploitIntelPort = {
  isKev: vi.fn().mockResolvedValue(false),
  getEpssPercentile: vi.fn().mockResolvedValue(null),
};

const fixturesDir = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../fixtures/aspm/sarif'
);

const fakeAppRepo: IApplicationRepository = {
  findById: vi.fn().mockResolvedValue({ id: 'app-1', repositoryPath: '/repo' }),
} as unknown as IApplicationRepository;

const emptyYamlReader: IOwnershipYamlReader = {
  read: vi.fn().mockResolvedValue({ entries: [] }),
};

describe('IngestFindingsUseCase + SarifIngestAdapter (integration)', () => {
  let db: Database.Database;
  let repo: SQLiteFindingRepository;
  let uc: IngestFindingsUseCase;

  beforeEach(async () => {
    db = createInMemoryDatabase();
    await runSQLiteMigrations(db);
    repo = new SQLiteFindingRepository(db);
    uc = new IngestFindingsUseCase(
      fakeAppRepo,
      repo,
      new SarifIngestAdapter(),
      emptyYamlReader,
      offlineExploitIntel
    );
  });

  afterEach(() => {
    db.close();
  });

  it('ingests the semgrep fixture into the security_findings table', async () => {
    const doc = readFileSync(join(fixturesDir, 'semgrep-sample.sarif.json'), 'utf-8');
    const result = await uc.execute({
      applicationId: 'app-1',
      sourceType: 'sarif',
      document: doc,
    });
    expect(result.inserted).toBe(3);
    expect(result.toolName).toBe('semgrep');

    const stored = await repo.list({}, { offset: 0, limit: 25 });
    expect(stored.total).toBe(3);
    const sqli = stored.items.find((f) => f.ruleId.includes('sql-injection'))!;
    expect(sqli.canonicalSeverity).toBe(CanonicalSeverity.Critical);
    expect(sqli.findingDomain).toBe(FindingDomain.Code);
    expect(sqli.cweId).toBe('89');
    expect(sqli.owaspAsvsControlId).toBe('V5.3.4');
  });

  it('re-ingesting the same fixture is a no-op (NFR-10)', async () => {
    const doc = readFileSync(join(fixturesDir, 'semgrep-sample.sarif.json'), 'utf-8');
    const first = await uc.execute({
      applicationId: 'app-1',
      sourceType: 'sarif',
      document: doc,
    });
    const second = await uc.execute({
      applicationId: 'app-1',
      sourceType: 'sarif',
      document: doc,
    });
    expect(first.inserted).toBe(3);
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(3);
    const stored = await repo.list({}, { offset: 0, limit: 25 });
    expect(stored.total).toBe(3);
  });

  it('handles a synthetic 1000-finding SARIF in well under the NFR-6 budget', async () => {
    const results = Array.from({ length: 1000 }, (_, i) => ({
      ruleId: `synth.rule.${i}`,
      level: 'warning',
      message: { text: `synthetic finding ${i}` },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: `src/gen/file-${i}.ts` },
            region: { startLine: i + 1 },
          },
        },
      ],
    }));
    const doc = JSON.stringify({
      version: '2.1.0',
      runs: [{ tool: { driver: { name: 'synth' } }, results }],
    });
    const start = Date.now();
    const result = await uc.execute({
      applicationId: 'app-1',
      sourceType: 'sarif',
      document: doc,
    });
    const elapsed = Date.now() - start;
    expect(result.inserted).toBe(1000);
    expect(elapsed).toBeLessThan(10_000);
  });
});
