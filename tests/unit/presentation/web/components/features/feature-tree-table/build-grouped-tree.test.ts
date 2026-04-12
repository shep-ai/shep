import { describe, it, expect } from 'vitest';
import { buildGroupedTree, displayLabel } from '@/components/features/feature-tree-table';
import type { FeatureTreeRow } from '@/components/features/feature-tree-table';

function makeRow(overrides: Partial<FeatureTreeRow> & { id: string }): FeatureTreeRow {
  return {
    name: `Feature ${overrides.id}`,
    status: 'pending',
    lifecycle: 'Planning',
    branch: `feat/${overrides.id}`,
    repositoryName: 'test-repo',
    ...overrides,
  };
}

describe('buildGroupedTree', () => {
  const sampleData: FeatureTreeRow[] = [
    makeRow({
      id: '1',
      name: 'Auth',
      status: 'in-progress',
      lifecycle: 'Implementation',
      repositoryName: 'app-a',
    }),
    makeRow({
      id: '2',
      name: 'OAuth',
      status: 'done',
      lifecycle: 'Maintain',
      repositoryName: 'app-a',
    }),
    makeRow({
      id: '3',
      name: 'Billing',
      status: 'in-progress',
      lifecycle: 'Planning',
      repositoryName: 'app-b',
    }),
    makeRow({
      id: '4',
      name: 'Dashboard',
      status: 'pending',
      lifecycle: 'Implementation',
      repositoryName: 'app-c',
    }),
    makeRow({
      id: '5',
      name: 'API',
      status: 'done',
      lifecycle: 'Maintain',
      repositoryName: 'app-b',
    }),
  ];

  describe('grouping by repositoryName', () => {
    it('creates one group header per unique repository', () => {
      const tree = buildGroupedTree(sampleData, 'repositoryName', 'asc', 'name', 'asc');

      expect(tree).toHaveLength(3);
      expect(tree.every((g) => g._isGroupHeader)).toBe(true);
      expect(tree.map((g) => g.name)).toEqual(['app-a', 'app-b', 'app-c']);
    });

    it('places correct children under each group', () => {
      const tree = buildGroupedTree(sampleData, 'repositoryName', 'asc', 'name', 'asc');

      const appA = tree.find((g) => g.name === 'app-a')!;
      expect(appA._groupCount).toBe(2);
      expect(appA._children).toHaveLength(2);
      expect(appA._children!.map((c) => c.id)).toEqual(['1', '2']);

      const appB = tree.find((g) => g.name === 'app-b')!;
      expect(appB._groupCount).toBe(2);

      const appC = tree.find((g) => g.name === 'app-c')!;
      expect(appC._groupCount).toBe(1);
    });
  });

  describe('grouping by status', () => {
    it('creates one group per unique status', () => {
      const tree = buildGroupedTree(sampleData, 'status', 'asc', 'name', 'asc');

      const groupNames = tree.map((g) => g.name);
      expect(groupNames).toContain('Done');
      expect(groupNames).toContain('In Progress');
      expect(groupNames).toContain('Pending');
    });

    it('uses display labels for status groups', () => {
      const tree = buildGroupedTree(sampleData, 'status', 'asc', 'name', 'asc');

      const inProgress = tree.find((g) => g.name === 'In Progress')!;
      expect(inProgress._groupCount).toBe(2);
    });
  });

  describe('grouping by lifecycle', () => {
    it('creates one group per unique lifecycle', () => {
      const tree = buildGroupedTree(sampleData, 'lifecycle', 'asc', 'name', 'asc');

      const groupNames = tree.map((g) => g.name);
      expect(groupNames).toContain('Implementation');
      expect(groupNames).toContain('Maintain');
      expect(groupNames).toContain('Planning');
    });
  });

  describe('group sort direction', () => {
    it('sorts groups ascending by name', () => {
      const tree = buildGroupedTree(sampleData, 'repositoryName', 'asc', 'name', 'asc');
      expect(tree.map((g) => g.name)).toEqual(['app-a', 'app-b', 'app-c']);
    });

    it('sorts groups descending by name', () => {
      const tree = buildGroupedTree(sampleData, 'repositoryName', 'desc', 'name', 'asc');
      expect(tree.map((g) => g.name)).toEqual(['app-c', 'app-b', 'app-a']);
    });
  });

  describe('item sort within groups', () => {
    it('sorts children by name ascending within each group', () => {
      const tree = buildGroupedTree(sampleData, 'repositoryName', 'asc', 'name', 'asc');

      const appA = tree.find((g) => g.name === 'app-a')!;
      expect(appA._children!.map((c) => c.name)).toEqual(['Auth', 'OAuth']);

      const appB = tree.find((g) => g.name === 'app-b')!;
      expect(appB._children!.map((c) => c.name)).toEqual(['API', 'Billing']);
    });

    it('sorts children by name descending within each group', () => {
      const tree = buildGroupedTree(sampleData, 'repositoryName', 'asc', 'name', 'desc');

      const appA = tree.find((g) => g.name === 'app-a')!;
      expect(appA._children!.map((c) => c.name)).toEqual(['OAuth', 'Auth']);

      const appB = tree.find((g) => g.name === 'app-b')!;
      expect(appB._children!.map((c) => c.name)).toEqual(['Billing', 'API']);
    });

    it('sorts children by status within each group', () => {
      const tree = buildGroupedTree(sampleData, 'repositoryName', 'asc', 'status', 'asc');

      const appA = tree.find((g) => g.name === 'app-a')!;
      expect(appA._children!.map((c) => c.status)).toEqual(['done', 'in-progress']);
    });

    it('sorts children by branch within each group', () => {
      const tree = buildGroupedTree(sampleData, 'repositoryName', 'asc', 'branch', 'asc');

      const appA = tree.find((g) => g.name === 'app-a')!;
      expect(appA._children!.map((c) => c.branch)).toEqual(['feat/1', 'feat/2']);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty input', () => {
      const tree = buildGroupedTree([], 'repositoryName', 'asc', 'name', 'asc');
      expect(tree).toEqual([]);
    });

    it('handles single feature', () => {
      const tree = buildGroupedTree(
        [makeRow({ id: 'only', repositoryName: 'solo' })],
        'repositoryName',
        'asc',
        'name',
        'asc'
      );
      expect(tree).toHaveLength(1);
      expect(tree[0]._isGroupHeader).toBe(true);
      expect(tree[0]._groupCount).toBe(1);
      expect(tree[0]._children).toHaveLength(1);
    });

    it('groups features with missing field value under Unknown', () => {
      const data = [makeRow({ id: '1', repositoryName: '' })];
      const tree = buildGroupedTree(data, 'repositoryName', 'asc', 'name', 'asc');

      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('Unknown');
    });

    it('group headers have correct id format', () => {
      const tree = buildGroupedTree(
        [makeRow({ id: '1', repositoryName: 'my-repo' })],
        'repositoryName',
        'asc',
        'name',
        'asc'
      );

      expect(tree[0].id).toBe('group-repositoryName-my-repo');
    });
  });
});

describe('displayLabel', () => {
  it('returns status display name for status groupBy', () => {
    expect(displayLabel('status', 'in-progress')).toBe('In Progress');
    expect(displayLabel('status', 'action-needed')).toBe('Action Needed');
    expect(displayLabel('status', 'done')).toBe('Done');
  });

  it('returns raw value for unknown status', () => {
    expect(displayLabel('status', 'unknown-status')).toBe('unknown-status');
  });

  it('returns raw value for non-status groupBy fields', () => {
    expect(displayLabel('repositoryName', 'my-repo')).toBe('my-repo');
    expect(displayLabel('lifecycle', 'Implementation')).toBe('Implementation');
  });
});
