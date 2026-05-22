/**
 * Repo-level aggregation pinned down here so the Inventory's Security and
 * Last-scan columns render the right totals on group-header rows without
 * spinning up Tabulator. The Tabulator-side formatters call these pure
 * helpers and wrap the result in HTML, so once these pass the formatter
 * is essentially a string template.
 */

import { describe, it, expect } from 'vitest';

import {
  aggregateOpenBySeverity,
  hasScannedChild,
  mostRecentScan,
  sumTotalOpen,
} from '@/components/features/aspm/aspm-inventory-tree/aspm-inventory-columns';
import type { FeatureTreeRow } from '@/components/features/feature-tree-table';

function app(overrides: Partial<FeatureTreeRow> = {}): FeatureTreeRow {
  return {
    id: 'app-x',
    name: 'x',
    status: 'done',
    lifecycle: 'Application',
    branch: '',
    repositoryName: 'r',
    _isApplication: true,
    _applicationId: 'x',
    _aspmOpenBySeverity: [],
    _aspmTotalOpen: 0,
    _aspmLastScannedAt: null,
    ...overrides,
  };
}

function placeholder(): FeatureTreeRow {
  return {
    id: 'repo-placeholder-r',
    name: '— no applications —',
    status: 'pending',
    lifecycle: '',
    branch: '',
    repositoryName: 'empty',
    _isApplication: false,
    _isRepoPlaceholder: true,
    _aspmOpenBySeverity: [],
    _aspmTotalOpen: 0,
    _aspmLastScannedAt: null,
  };
}

describe('aspm-inventory-columns aggregation helpers', () => {
  it('sums child severity counts into a single severity → total map', () => {
    const totals = aggregateOpenBySeverity([
      app({
        _aspmOpenBySeverity: [
          { severity: 'Critical', count: 2 },
          { severity: 'High', count: 1 },
        ],
      }),
      app({
        _aspmOpenBySeverity: [
          { severity: 'Critical', count: 1 },
          { severity: 'Medium', count: 3 },
        ],
      }),
    ]);
    expect(totals.get('Critical')).toBe(3);
    expect(totals.get('High')).toBe(1);
    expect(totals.get('Medium')).toBe(3);
    expect(totals.get('Low')).toBeUndefined();
  });

  it('ignores placeholder rows so empty repos do not skew totals', () => {
    const totals = aggregateOpenBySeverity([
      placeholder(),
      app({ _aspmOpenBySeverity: [{ severity: 'Critical', count: 5 }] }),
    ]);
    expect(totals.get('Critical')).toBe(5);
    expect(sumTotalOpen([placeholder(), app({ _aspmTotalOpen: 5 })])).toBe(5);
  });

  it('returns the most recent scan timestamp across non-placeholder children', () => {
    const older = new Date('2026-04-01T00:00:00Z');
    const newer = new Date('2026-05-01T00:00:00Z');
    const result = mostRecentScan([
      app({ _aspmLastScannedAt: older }),
      app({ _aspmLastScannedAt: newer }),
      placeholder(),
    ]);
    expect(result).toEqual(newer);
  });

  it('returns null when no child has ever been scanned', () => {
    expect(mostRecentScan([app({ _aspmLastScannedAt: null }), placeholder()])).toBeNull();
    expect(hasScannedChild([app({ _aspmLastScannedAt: null }), placeholder()])).toBe(false);
  });

  it('reports hasScannedChild as true when at least one real child has a timestamp', () => {
    expect(
      hasScannedChild([app({ _aspmLastScannedAt: null }), app({ _aspmLastScannedAt: new Date() })])
    ).toBe(true);
  });
});
