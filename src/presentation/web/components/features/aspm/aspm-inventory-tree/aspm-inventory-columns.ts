/**
 * Tabulator column formatters specific to the ASPM Inventory tree-table.
 * Kept as pure HTML strings so Tabulator owns rendering — React portals
 * are reserved for the actions column (see {@link AspmRowActionsManager}).
 *
 * On repository group-header rows the Security + Last-scan columns render
 * an aggregate across the group's children so reviewers can scan a repo's
 * total posture without expanding every app. The aggregation helpers
 * ({@link aggregateOpenBySeverity}, {@link mostRecentScan}) are exported
 * for direct unit testing without a Tabulator instance.
 */

import type { CellComponent, ColumnDefinition } from 'tabulator-tables';

import type { FeatureTreeRow } from '@/components/features/feature-tree-table';

const SEVERITY_ORDER = ['Critical', 'High', 'Medium', 'Low', 'Info'] as const;
type SeverityKey = (typeof SEVERITY_ORDER)[number];

const SEVERITY_BADGE_STYLES: Record<SeverityKey, string> = {
  Critical: 'background:#fee2e2;color:#7f1d1d;border:1px solid #fca5a5;',
  High: 'background:#ffedd5;color:#7c2d12;border:1px solid #fdba74;',
  Medium: 'background:#fef3c7;color:#78350f;border:1px solid #fcd34d;',
  Low: 'background:#e0f2fe;color:#075985;border:1px solid #7dd3fc;',
  Info: 'background:#f5f5f5;color:#262626;border:1px solid #d4d4d4;',
};

const SEVERITY_INITIAL: Record<SeverityKey, string> = {
  Critical: 'C',
  High: 'H',
  Medium: 'M',
  Low: 'L',
  Info: 'I',
};

function badge(severity: SeverityKey, count: number): string {
  const style = SEVERITY_BADGE_STYLES[severity];
  const dim = count === 0 ? 'opacity:0.4;' : '';
  return `<span title="${severity}: ${count}" style="display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:9999px;font-size:11px;font-weight:600;${style}${dim}"><span>${SEVERITY_INITIAL[severity]}</span><span style="font-variant-numeric:tabular-nums">${count}</span></span>`;
}

/**
 * Sums every child's `_aspmOpenBySeverity` into a single severity → count
 * map. Skips placeholder rows so an empty repository reads "0 across the
 * board" instead of double-counting an unscanned synthetic row.
 */
export function aggregateOpenBySeverity(children: readonly FeatureTreeRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const child of children) {
    if (child._isRepoPlaceholder) continue;
    const counts = child._aspmOpenBySeverity ?? [];
    for (const c of counts) {
      totals.set(c.severity, (totals.get(c.severity) ?? 0) + c.count);
    }
  }
  return totals;
}

export function sumTotalOpen(children: readonly FeatureTreeRow[]): number {
  let total = 0;
  for (const child of children) {
    if (child._isRepoPlaceholder) continue;
    total += child._aspmTotalOpen ?? 0;
  }
  return total;
}

export function mostRecentScan(children: readonly FeatureTreeRow[]): Date | null {
  let best: Date | null = null;
  for (const child of children) {
    if (child._isRepoPlaceholder) continue;
    const ts = child._aspmLastScannedAt;
    if (ts === null || ts === undefined) continue;
    const d = ts instanceof Date ? ts : new Date(ts);
    if (best === null || d.getTime() > best.getTime()) best = d;
  }
  return best;
}

/**
 * True when every child under a repo group is either a placeholder or has
 * been scanned at least once. Used to distinguish "this whole repo is
 * un-scanned" from "this repo has been scanned and has zero findings".
 */
export function hasScannedChild(children: readonly FeatureTreeRow[]): boolean {
  for (const child of children) {
    if (child._isRepoPlaceholder) continue;
    if (child._aspmLastScannedAt !== null && child._aspmLastScannedAt !== undefined) return true;
  }
  return false;
}

function renderSeverityRow(totals: Map<string, number>): string {
  const visible: SeverityKey[] = ['Critical', 'High', 'Medium', 'Low'];
  return `<span style="display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap">${visible
    .map((s) => badge(s, totals.get(s) ?? 0))
    .join('')}</span>`;
}

function aspmSecurityFormatter(cell: CellComponent): string {
  const row = cell.getRow().getData() as FeatureTreeRow;

  if (row._isGroupHeader) {
    const children = row._children ?? [];
    const total = sumTotalOpen(children);
    if (!hasScannedChild(children)) {
      return `<span style="color:var(--color-muted-foreground,#64748b);font-size:12px">Repository never scanned</span>`;
    }
    if (total === 0) {
      return `<span style="color:#047857;font-size:12px;font-weight:500">All clear</span>`;
    }
    const aggregate = aggregateOpenBySeverity(children);
    return renderSeverityRow(aggregate);
  }

  if (row._isRepoPlaceholder) {
    return `<span style="color:var(--color-muted-foreground,#64748b);font-size:12px;font-style:italic">No applications or branches yet</span>`;
  }

  if (row._isAspmFeature) {
    return `<span style="color:var(--color-muted-foreground,#64748b);font-size:12px">Scan to populate</span>`;
  }

  if (row._isRepoGroup) return '';
  if (!row._isApplication) return '';
  const counts = row._aspmOpenBySeverity ?? [];
  const byKey = new Map<SeverityKey, number>();
  for (const c of counts) {
    const key = c.severity as SeverityKey;
    if (SEVERITY_ORDER.includes(key)) byKey.set(key, c.count);
  }
  const total = row._aspmTotalOpen ?? 0;
  if (total === 0 && (row._aspmLastScannedAt === null || row._aspmLastScannedAt === undefined)) {
    return `<span style="color:var(--color-muted-foreground,#64748b);font-size:12px">Never scanned</span>`;
  }
  if (total === 0) {
    return `<span style="color:var(--color-muted-foreground,#64748b);font-size:12px">No open findings</span>`;
  }
  return renderSeverityRow(byKey as Map<string, number>);
}

function relativeTime(date: Date | null | undefined): string {
  if (date === null || date === undefined) return '—';
  const ms = Date.now() - new Date(date).getTime();
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon}mo ago`;
  return `${Math.floor(mon / 12)}y ago`;
}

function aspmLastScannedFormatter(cell: CellComponent): string {
  const row = cell.getRow().getData() as FeatureTreeRow;

  if (row._isGroupHeader) {
    const best = mostRecentScan(row._children ?? []);
    if (best === null) {
      return `<span style="color:#b91c1c;font-size:12px;font-weight:500">Never</span>`;
    }
    return `<span style="font-size:12px;color:var(--color-muted-foreground,#64748b)" title="Latest across apps: ${best.toLocaleString()}">${relativeTime(best)}</span>`;
  }

  if (row._isRepoPlaceholder) {
    return `<span style="color:var(--color-muted-foreground,#64748b);font-size:12px">—</span>`;
  }

  if (row._isAspmFeature) {
    return `<span style="color:var(--color-muted-foreground,#64748b);font-size:12px">—</span>`;
  }

  if (row._isRepoGroup) return '';
  if (!row._isApplication) return '';
  const date = row._aspmLastScannedAt;
  if (date === null || date === undefined) {
    return `<span style="color:#b91c1c;font-size:12px;font-weight:500">Never</span>`;
  }
  return `<span style="font-size:12px;color:var(--color-muted-foreground,#64748b)" title="${new Date(date).toLocaleString()}">${relativeTime(date)}</span>`;
}

/**
 * Returns the ASPM-specific extra columns (severity rollup + last scanned)
 * inserted between Branch and the frozen actions column.
 */
export function buildAspmExtraColumns(): ColumnDefinition[] {
  return [
    {
      title: 'Security',
      field: '_aspmTotalOpen',
      widthGrow: 2.5,
      headerSort: true,
      formatter: aspmSecurityFormatter,
      sorter: 'number',
    },
    {
      title: 'Last scan',
      field: '_aspmLastScannedAt',
      widthGrow: 1.2,
      headerSort: true,
      formatter: aspmLastScannedFormatter,
      sorter: (a, b) => {
        const av = a instanceof Date ? a.getTime() : -1;
        const bv = b instanceof Date ? b.getTime() : -1;
        return av - bv;
      },
    },
  ];
}
