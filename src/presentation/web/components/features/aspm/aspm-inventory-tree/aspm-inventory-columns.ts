/**
 * Tabulator column formatters specific to the ASPM Inventory tree-table.
 * Kept as pure HTML strings so Tabulator owns rendering — React portals
 * are reserved for the actions column (see {@link AspmRowActionsManager}).
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

function aspmSecurityFormatter(cell: CellComponent): string {
  const row = cell.getRow().getData() as FeatureTreeRow;
  if (row._isGroupHeader || row._isRepoGroup) return '';
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
  const visible: SeverityKey[] = ['Critical', 'High', 'Medium', 'Low'];
  return `<span style="display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap">${visible
    .map((s) => badge(s, byKey.get(s) ?? 0))
    .join('')}</span>`;
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
  if (row._isGroupHeader || row._isRepoGroup) return '';
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
