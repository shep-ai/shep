/**
 * CycloneDX SBOM adapter integration tests (feature 098, phase 4, task-20).
 */

import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CycloneDxSbomAdapter,
  CycloneDxParseError,
} from '@/infrastructure/services/aspm/cyclonedx-sbom-adapter.js';
import { IngestionTooLargeError } from '@/domain/aspm/errors/ingestion-too-large.error.js';
import { CanonicalSeverity } from '@/domain/generated/output.js';

const fixturesDir = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../../fixtures/aspm/sbom'
);

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('CycloneDxSbomAdapter', () => {
  const adapter = new CycloneDxSbomAdapter();

  it('parses a CycloneDX 1.5 fixture into components and vulnerabilities', async () => {
    const result = await adapter.parse({
      document: loadFixture('cyclonedx-1.5-sample.json'),
    });

    expect(result.bomFormat).toBe('CycloneDX');
    expect(result.specVersion).toBe('1.5');
    expect(result.sourceLabel).toBe('cyclonedx:1.5');
    expect(result.toolName).toBe('cdxgen');

    expect(result.components).toHaveLength(3);
    const log4j = result.components.find((c) => c.name === 'log4j-core')!;
    expect(log4j).toBeDefined();
    expect(log4j.version).toBe('2.14.1');
    expect(log4j.purl).toBe('pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1');
    expect(log4j.licenses).toEqual(['Apache-2.0']);

    expect(result.vulnerabilities).toHaveLength(3);
    const log4shell = result.vulnerabilities.find((v) => v.id === 'CVE-2021-44228')!;
    expect(log4shell.cveId).toBe('CVE-2021-44228');
    expect(log4shell.canonicalSeverity).toBe(CanonicalSeverity.Critical);
    expect(log4shell.cvssScore).toBe(10);
    expect(log4shell.cweIds).toEqual(['502', '917']);
    expect(log4shell.affectedComponentRefs).toContain(
      'pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1'
    );

    const lodash = result.vulnerabilities.find((v) => v.id === 'CVE-2020-8203')!;
    expect(lodash.canonicalSeverity).toBe(CanonicalSeverity.High);
    expect(lodash.cveId).toBe('CVE-2020-8203');
    expect(lodash.cvssScore).toBe(7.4);

    const ghsa = result.vulnerabilities.find((v) => v.id === 'GHSA-3xpr-x77f-jh43')!;
    expect(ghsa.cveId).toBeUndefined();
    expect(ghsa.canonicalSeverity).toBe(CanonicalSeverity.Medium);
  });

  it('rejects an oversized document with IngestionTooLargeError', async () => {
    const tinyDoc = JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.5' });
    await expect(adapter.parse({ document: tinyDoc, maxBytes: 4 })).rejects.toBeInstanceOf(
      IngestionTooLargeError
    );
  });

  it('rejects malformed JSON with a typed parse error', async () => {
    await expect(adapter.parse({ document: 'not-json' })).rejects.toBeInstanceOf(
      CycloneDxParseError
    );
  });

  it('rejects a JSON document that does not declare bomFormat', async () => {
    await expect(
      adapter.parse({ document: JSON.stringify({ specVersion: '1.5' }) })
    ).rejects.toBeInstanceOf(CycloneDxParseError);
  });

  it('rejects a JSON document whose bomFormat is not CycloneDX', async () => {
    await expect(
      adapter.parse({
        document: JSON.stringify({ bomFormat: 'SPDX', specVersion: '1.5' }),
      })
    ).rejects.toBeInstanceOf(CycloneDxParseError);
  });

  it('tolerates a document with no components and no vulnerabilities', async () => {
    const result = await adapter.parse({
      document: JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.5' }),
    });
    expect(result.components).toEqual([]);
    expect(result.vulnerabilities).toEqual([]);
  });
});
