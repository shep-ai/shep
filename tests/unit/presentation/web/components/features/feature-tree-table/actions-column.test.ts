import { describe, it, expect } from 'vitest';
import {
  buildColumns,
  actionsColumnFormatter,
  ACTIONS_COLUMN_FIELD,
} from '@/components/features/feature-tree-table/feature-tree-table';
import type { FeatureTreeRow } from '@/components/features/feature-tree-table/feature-tree-table';

/** Minimal mock matching the CellComponent interface used by the formatter. */
function mockCellComponent(rowData: FeatureTreeRow): Parameters<typeof actionsColumnFormatter>[0] {
  return {
    getRow: () => ({
      getData: () => rowData,
    }),
    getValue: () => undefined,
  } as unknown as Parameters<typeof actionsColumnFormatter>[0];
}

describe('buildColumns', () => {
  it('includes an actions column as the last column', () => {
    const cols = buildColumns({});
    const lastCol = cols[cols.length - 1];
    expect(lastCol.field).toBe(ACTIONS_COLUMN_FIELD);
  });

  it('actions column is frozen with fixed width and no header sort', () => {
    const cols = buildColumns({});
    const actionsCol = cols.find((c) => c.field === ACTIONS_COLUMN_FIELD);
    expect(actionsCol).toBeDefined();
    expect(actionsCol!.frozen).toBe(true);
    expect(actionsCol!.width).toBe(48);
    expect(actionsCol!.headerSort).toBe(false);
    expect(actionsCol!.resizable).toBe(false);
  });

  it('actions column is present regardless of groupBy mode', () => {
    for (const groupBy of ['repositoryName', 'status', 'lifecycle', null] as const) {
      const cols = buildColumns({ groupBy });
      const actionsCol = cols.find((c) => c.field === ACTIONS_COLUMN_FIELD);
      expect(actionsCol).toBeDefined();
    }
  });

  it('actions column is always the last column', () => {
    for (const groupBy of ['repositoryName', 'status', 'lifecycle', null] as const) {
      const cols = buildColumns({ groupBy });
      const lastCol = cols[cols.length - 1];
      expect(lastCol.field).toBe(ACTIONS_COLUMN_FIELD);
    }
  });
});

describe('actionsColumnFormatter', () => {
  it('creates a div with data-feature-id for regular data rows', () => {
    const row: FeatureTreeRow = {
      id: 'feat-123',
      name: 'Test Feature',
      status: 'pending',
      lifecycle: 'Planning',
      branch: 'feat/test',
      repositoryName: 'my-repo',
      nodeState: 'pending',
    };

    const result = actionsColumnFormatter(mockCellComponent(row));
    expect(result).toBeInstanceOf(HTMLElement);
    const el = result as HTMLElement;
    expect(el.getAttribute('data-feature-id')).toBe('feat-123');
  });

  it('returns empty string for group header rows', () => {
    const row: FeatureTreeRow = {
      id: 'group-status-pending',
      name: 'Pending',
      status: 'pending',
      lifecycle: '',
      branch: '',
      repositoryName: '',
      _isGroupHeader: true,
      _groupCount: 3,
    };

    const result = actionsColumnFormatter(mockCellComponent(row));
    expect(result).toBe('');
  });

  it('returns empty string for repo group rows', () => {
    const row: FeatureTreeRow = {
      id: 'repo-my-app',
      name: 'my-app',
      status: 'pending',
      lifecycle: '',
      branch: '',
      repositoryName: 'my-app',
      _isRepoGroup: true,
      _featureCount: 5,
    };

    const result = actionsColumnFormatter(mockCellComponent(row));
    expect(result).toBe('');
  });

  it('container div has flex centering styles', () => {
    const row: FeatureTreeRow = {
      id: 'feat-456',
      name: 'Another Feature',
      status: 'done',
      lifecycle: 'Maintain',
      branch: 'feat/another',
      repositoryName: 'my-repo',
    };

    const result = actionsColumnFormatter(mockCellComponent(row));
    const el = result as HTMLElement;
    expect(el.style.display).toBe('flex');
    expect(el.style.alignItems).toBe('center');
    expect(el.style.justifyContent).toBe('center');
  });
});
