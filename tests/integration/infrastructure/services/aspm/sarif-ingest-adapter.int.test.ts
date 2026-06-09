/**
 * SARIF ingest adapter integration tests (feature 098, phase 3, FR-7).
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SarifIngestAdapter,
  SarifIngestParseError,
} from '@/infrastructure/services/aspm/sarif-ingest-adapter.js';
import { IngestionTooLargeError } from '@/domain/aspm/errors/ingestion-too-large.error.js';
import { CanonicalSeverity, FindingDomain } from '@/domain/generated/output.js';

const fixturesDir = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../fixtures/aspm/sarif'
);

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('SarifIngestAdapter', () => {
  const adapter = new SarifIngestAdapter();

  it('parses a Semgrep SARIF fixture into the expected drafts', async () => {
    const result = await adapter.parse({ document: loadFixture('semgrep-sample.sarif.json') });
    expect(result.drafts).toHaveLength(3);
    expect(result.toolName).toBe('semgrep');
    expect(result.sourceLabel).toBe('sarif:semgrep');

    const sqli = result.drafts[0]!;
    expect(sqli.ruleId).toBe('javascript.express.security.sql-injection');
    expect(sqli.canonicalSeverity).toBe(CanonicalSeverity.Critical);
    expect(sqli.locationPath).toBe('src/api/users.ts');
    expect(sqli.locationLine).toBe(42);
    // Walker normalizes bare CWE ids to the canonical "CWE-NNN" form so
    // compliance-control lookups against the seed table match exactly
    // (feature 098, task-53).
    expect(sqli.cweId).toBe('CWE-89');
    expect(sqli.owaspAsvsControlId).toBe('V5.3.4');
    expect(sqli.findingDomain).toBe(FindingDomain.Code);

    const xssA = result.drafts[1]!;
    expect(xssA.locationPath).toBe('src/web/search.tsx');
    expect(xssA.canonicalSeverity).toBe(CanonicalSeverity.Medium);
  });

  it('parses a Trivy SARIF fixture and infers Container domain', async () => {
    const result = await adapter.parse({ document: loadFixture('trivy-sample.sarif.json') });
    expect(result.drafts).toHaveLength(1);
    expect(result.sourceLabel).toBe('sarif:trivy');
    const draft = result.drafts[0]!;
    // Trivy default mapping is Container; per-rule tag 'dependency' takes precedence.
    expect(draft.findingDomain).toBe(FindingDomain.Dependency);
    expect(draft.cveId).toBe('CVE-2024-1234');
    expect(draft.canonicalSeverity).toBe(CanonicalSeverity.High);
  });

  it('rejects an oversized document with IngestionTooLargeError', async () => {
    const body = '{"runs":[]}';
    await expect(adapter.parse({ document: body, maxBytes: 4 })).rejects.toBeInstanceOf(
      IngestionTooLargeError
    );
  });

  it('rejects malformed JSON with a typed parse error', async () => {
    await expect(adapter.parse({ document: 'not-json' })).rejects.toBeInstanceOf(
      SarifIngestParseError
    );
  });

  it('rejects a JSON document that does not match SARIF schema', async () => {
    await expect(adapter.parse({ document: '{"version":"2.1.0"}' })).rejects.toBeInstanceOf(
      SarifIngestParseError
    );
  });

  it('tolerates an empty runs array', async () => {
    const result = await adapter.parse({
      document: JSON.stringify({
        $schema: 'sarif',
        version: '2.1.0',
        runs: [{ tool: { driver: { name: 'codeql' } }, results: [] }],
      }),
    });
    expect(result.drafts).toEqual([]);
    expect(result.sourceLabel).toBe('sarif:codeql');
  });
});
