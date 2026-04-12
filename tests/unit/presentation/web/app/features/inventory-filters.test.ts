import { describe, it, expect } from 'vitest';
import { isArchived, getItemSortOptions } from '@/app/features/feature-tree-page-client';
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

describe('isArchived', () => {
  it('returns true for Archived lifecycle', () => {
    expect(isArchived(makeRow({ id: '1', lifecycle: 'Archived' }))).toBe(true);
  });

  it('returns false for Maintain lifecycle', () => {
    expect(isArchived(makeRow({ id: '1', lifecycle: 'Maintain' }))).toBe(false);
  });

  it('returns false for active lifecycles', () => {
    const activeLifecycles = [
      'Started',
      'Analyze',
      'Requirements',
      'Research',
      'Planning',
      'Implementation',
      'Review',
      'Blocked',
      'Pending',
      'Deleting',
      'AwaitingUpstream',
    ];

    for (const lifecycle of activeLifecycles) {
      expect(isArchived(makeRow({ id: '1', lifecycle }))).toBe(false);
    }
  });
});

describe('getItemSortOptions', () => {
  it('returns all options when no groupBy', () => {
    const options = getItemSortOptions(null);

    expect(options.map((o) => o.value)).toEqual([
      'name',
      'repositoryName',
      'status',
      'lifecycle',
      'branch',
    ]);
  });

  it('excludes repositoryName when grouped by repositoryName', () => {
    const options = getItemSortOptions('repositoryName');

    const values = options.map((o) => o.value);
    expect(values).not.toContain('repositoryName');
    expect(values).toContain('name');
    expect(values).toContain('status');
    expect(values).toContain('lifecycle');
    expect(values).toContain('branch');
  });

  it('excludes status when grouped by status', () => {
    const options = getItemSortOptions('status');

    const values = options.map((o) => o.value);
    expect(values).not.toContain('status');
    expect(values).toContain('name');
    expect(values).toContain('repositoryName');
  });

  it('excludes lifecycle when grouped by lifecycle', () => {
    const options = getItemSortOptions('lifecycle');

    const values = options.map((o) => o.value);
    expect(values).not.toContain('lifecycle');
    expect(values).toContain('name');
    expect(values).toContain('status');
  });
});

describe('filtering logic', () => {
  const allFeatures: FeatureTreeRow[] = [
    makeRow({
      id: '1',
      name: 'Auth System',
      status: 'in-progress',
      lifecycle: 'Implementation',
      repositoryName: 'app-a',
      branch: 'feat/auth',
    }),
    makeRow({
      id: '2',
      name: 'Billing',
      status: 'done',
      lifecycle: 'Maintain',
      repositoryName: 'app-b',
      branch: 'feat/billing',
    }),
    makeRow({
      id: '3',
      name: 'Archive Feature',
      status: 'done',
      lifecycle: 'Archived',
      repositoryName: 'app-a',
      branch: 'feat/archive',
    }),
    makeRow({
      id: '4',
      name: 'Dashboard',
      status: 'pending',
      lifecycle: 'Planning',
      repositoryName: 'app-c',
      branch: 'feat/dashboard',
    }),
    makeRow({
      id: '5',
      name: 'API Gateway',
      status: 'in-progress',
      lifecycle: 'Research',
      repositoryName: 'app-b',
      branch: 'feat/api',
    }),
  ];

  // Replicate the filter logic from the component as a pure function for testing
  function applyFilters(
    features: FeatureTreeRow[],
    opts: {
      searchQuery?: string;
      statusFilter?: string | null;
      archiveFilter?: 'active' | 'archived' | 'all';
      repoFilter?: string | null;
    }
  ): FeatureTreeRow[] {
    const query = (opts.searchQuery ?? '').toLowerCase();
    const archiveMode = opts.archiveFilter ?? 'active';

    return features.filter((feature) => {
      if (archiveMode === 'active' && isArchived(feature)) return false;
      if (archiveMode === 'archived' && !isArchived(feature)) return false;
      if (opts.statusFilter && feature.status !== opts.statusFilter) return false;
      if (opts.repoFilter && feature.repositoryName !== opts.repoFilter) return false;
      if (query) {
        const matchesName = feature.name.toLowerCase().includes(query);
        const matchesBranch = feature.branch.toLowerCase().includes(query);
        const matchesRepo = feature.repositoryName.toLowerCase().includes(query);
        if (!matchesName && !matchesBranch && !matchesRepo) return false;
      }
      return true;
    });
  }

  describe('archive filter', () => {
    it('filters out archived features in active mode', () => {
      const result = applyFilters(allFeatures, { archiveFilter: 'active' });

      expect(result.map((f) => f.id)).toEqual(['1', '2', '4', '5']);
      expect(result.every((f) => !isArchived(f))).toBe(true);
    });

    it('shows only archived features in archived mode', () => {
      const result = applyFilters(allFeatures, { archiveFilter: 'archived' });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('3');
    });

    it('shows all features in all mode', () => {
      const result = applyFilters(allFeatures, { archiveFilter: 'all' });

      expect(result).toHaveLength(5);
    });
  });

  describe('status filter', () => {
    it('filters by specific status', () => {
      const result = applyFilters(allFeatures, {
        archiveFilter: 'all',
        statusFilter: 'in-progress',
      });

      expect(result.map((f) => f.id)).toEqual(['1', '5']);
    });

    it('shows all when status filter is null', () => {
      const result = applyFilters(allFeatures, {
        archiveFilter: 'all',
        statusFilter: null,
      });

      expect(result).toHaveLength(5);
    });

    it('returns empty when no features match status', () => {
      const result = applyFilters(allFeatures, {
        archiveFilter: 'all',
        statusFilter: 'error',
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('repository filter', () => {
    it('filters by specific repository', () => {
      const result = applyFilters(allFeatures, {
        archiveFilter: 'all',
        repoFilter: 'app-b',
      });

      expect(result.map((f) => f.id)).toEqual(['2', '5']);
    });

    it('shows all when repo filter is null', () => {
      const result = applyFilters(allFeatures, {
        archiveFilter: 'all',
        repoFilter: null,
      });

      expect(result).toHaveLength(5);
    });
  });

  describe('search', () => {
    it('matches by feature name', () => {
      const result = applyFilters(allFeatures, {
        archiveFilter: 'all',
        searchQuery: 'auth',
      });

      expect(result.map((f) => f.id)).toEqual(['1']);
    });

    it('matches by branch name', () => {
      const result = applyFilters(allFeatures, {
        archiveFilter: 'all',
        searchQuery: 'feat/api',
      });

      expect(result.map((f) => f.id)).toEqual(['5']);
    });

    it('matches by repository name', () => {
      const result = applyFilters(allFeatures, {
        archiveFilter: 'all',
        searchQuery: 'app-c',
      });

      expect(result.map((f) => f.id)).toEqual(['4']);
    });

    it('is case insensitive', () => {
      const result = applyFilters(allFeatures, {
        archiveFilter: 'all',
        searchQuery: 'BILLING',
      });

      expect(result.map((f) => f.id)).toEqual(['2']);
    });

    it('returns empty when nothing matches', () => {
      const result = applyFilters(allFeatures, {
        archiveFilter: 'all',
        searchQuery: 'nonexistent',
      });

      expect(result).toHaveLength(0);
    });
  });

  describe('combined filters', () => {
    it('applies archive + status filters together', () => {
      const result = applyFilters(allFeatures, {
        archiveFilter: 'active',
        statusFilter: 'done',
      });

      // Only feature 2 is done AND active (feature 3 is done but archived)
      expect(result.map((f) => f.id)).toEqual(['2']);
    });

    it('applies archive + repo + search together', () => {
      const result = applyFilters(allFeatures, {
        archiveFilter: 'active',
        repoFilter: 'app-b',
        searchQuery: 'api',
      });

      expect(result.map((f) => f.id)).toEqual(['5']);
    });

    it('applies all filters together', () => {
      const result = applyFilters(allFeatures, {
        archiveFilter: 'active',
        statusFilter: 'in-progress',
        repoFilter: 'app-a',
        searchQuery: 'auth',
      });

      expect(result.map((f) => f.id)).toEqual(['1']);
    });

    it('returns empty when combined filters exclude everything', () => {
      const result = applyFilters(allFeatures, {
        archiveFilter: 'active',
        statusFilter: 'error',
        repoFilter: 'app-a',
        searchQuery: 'nonexistent',
      });

      expect(result).toHaveLength(0);
    });
  });
});
