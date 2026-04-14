import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeatureTreeTable } from '@/components/features/feature-tree-table';
import type { FeatureTreeRow } from '@/components/features/feature-tree-table';

const sampleData: FeatureTreeRow[] = [
  {
    id: 'feat-1',
    name: 'Auth System',
    status: 'done',
    lifecycle: 'Maintain',
    branch: 'feat/auth',
    repositoryName: 'my-app',
  },
  {
    id: 'feat-2',
    name: 'OAuth Provider',
    status: 'in-progress',
    lifecycle: 'Implementation',
    branch: 'feat/oauth',
    repositoryName: 'my-app',
    parentId: 'feat-1',
  },
];

const sampleDataWithState: FeatureTreeRow[] = [
  {
    id: 'feat-1',
    name: 'Auth System',
    status: 'done',
    lifecycle: 'Maintain',
    branch: 'feat/auth',
    repositoryName: 'my-app',
    nodeState: 'done',
    hasChildren: true,
    hasOpenPr: false,
  },
  {
    id: 'feat-2',
    name: 'OAuth Provider',
    status: 'in-progress',
    lifecycle: 'Implementation',
    branch: 'feat/oauth',
    repositoryName: 'my-app',
    parentId: 'feat-1',
    nodeState: 'running',
    hasChildren: false,
    hasOpenPr: true,
  },
];

describe('FeatureTreeTable', () => {
  it('renders the container element with data-testid', () => {
    render(<FeatureTreeTable data={sampleData} />);

    expect(screen.getByTestId('feature-tree-table')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<FeatureTreeTable data={sampleData} className="my-custom-class" />);

    const container = screen.getByTestId('feature-tree-table');
    expect(container.className).toContain('my-custom-class');
  });

  it('renders without errors when data is empty', () => {
    render(<FeatureTreeTable data={[]} />);

    expect(screen.getByTestId('feature-tree-table')).toBeInTheDocument();
  });

  it('renders with extended FeatureTreeRow fields (nodeState, hasChildren, hasOpenPr)', () => {
    render(<FeatureTreeTable data={sampleDataWithState} />);

    expect(screen.getByTestId('feature-tree-table')).toBeInTheDocument();
  });
});
