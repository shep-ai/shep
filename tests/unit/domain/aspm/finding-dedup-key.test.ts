/**
 * Unit tests for the SecurityFinding dedup key (feature 098, phase 3, FR-8).
 */

import { describe, it, expect } from 'vitest';
import { findingDedupKey } from '@/domain/aspm/dedup/finding-dedup-key.js';
import { FindingDomain } from '@/domain/generated/output.js';

describe('findingDedupKey', () => {
  const base = {
    applicationId: 'app-1',
    findingDomain: FindingDomain.Code,
    ruleId: 'semgrep.sql-injection',
    locationPath: 'src/foo.ts',
    locationLine: 12,
    cveId: undefined,
  };

  it('is deterministic for identical inputs', () => {
    expect(findingDedupKey(base)).toBe(findingDedupKey(base));
  });

  it('changes when applicationId differs', () => {
    expect(findingDedupKey(base)).not.toBe(findingDedupKey({ ...base, applicationId: 'app-2' }));
  });

  it('changes when ruleId differs', () => {
    expect(findingDedupKey(base)).not.toBe(findingDedupKey({ ...base, ruleId: 'other' }));
  });

  it('changes when cveId differs', () => {
    expect(findingDedupKey(base)).not.toBe(findingDedupKey({ ...base, cveId: 'CVE-2024-1' }));
    expect(findingDedupKey({ ...base, cveId: 'CVE-2024-1' })).not.toBe(
      findingDedupKey({ ...base, cveId: 'CVE-2024-2' })
    );
  });

  it('changes when finding domain differs', () => {
    expect(findingDedupKey({ ...base, findingDomain: FindingDomain.Code })).not.toBe(
      findingDedupKey({ ...base, findingDomain: FindingDomain.Dependency })
    );
  });

  it('normalizes Windows backslash paths to POSIX', () => {
    const win = { ...base, locationPath: 'src\\foo.ts' };
    const posix = { ...base, locationPath: 'src/foo.ts' };
    expect(findingDedupKey(win)).toBe(findingDedupKey(posix));
  });

  it('handles missing optional fields without throwing', () => {
    const minimal = {
      applicationId: 'app-1',
      findingDomain: FindingDomain.Dependency,
      ruleId: 'cve-only',
    };
    expect(() => findingDedupKey(minimal)).not.toThrow();
    expect(findingDedupKey(minimal)).toBe(findingDedupKey(minimal));
  });

  it('treats absent location as distinct from line 0', () => {
    const noLocation = { ...base, locationPath: undefined, locationLine: undefined };
    const lineZero = { ...base, locationPath: '', locationLine: 0 };
    expect(findingDedupKey(noLocation)).not.toBe(findingDedupKey(lineZero));
  });
});
