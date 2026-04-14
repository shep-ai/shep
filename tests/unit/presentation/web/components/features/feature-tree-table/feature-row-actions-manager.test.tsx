import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeatureRowActionsManager } from '@/components/features/feature-tree-table/feature-row-actions-manager';
import type { FeatureTreeRow } from '@/components/features/feature-tree-table/feature-tree-table';

const noopAction = vi.fn();

const defaultCallbacks = {
  onStart: noopAction,
  onStop: noopAction,
  onRetry: noopAction,
  onReview: noopAction,
  onArchive: noopAction,
  onUnarchive: noopAction,
  onDelete: noopAction,
};

function createContainerWithPortalTargets(featureIds: string[]): HTMLDivElement {
  const container = document.createElement('div');
  for (const id of featureIds) {
    const target = document.createElement('div');
    target.setAttribute('data-feature-id', id);
    container.appendChild(target);
  }
  document.body.appendChild(container);
  return container;
}

const sampleFeatures: FeatureTreeRow[] = [
  {
    id: 'feat-1',
    name: 'Auth System',
    status: 'done',
    lifecycle: 'Maintain',
    branch: 'feat/auth',
    repositoryName: 'my-app',
    nodeState: 'done',
    hasChildren: false,
    hasOpenPr: false,
  },
  {
    id: 'feat-2',
    name: 'OAuth Provider',
    status: 'in-progress',
    lifecycle: 'Implementation',
    branch: 'feat/oauth',
    repositoryName: 'my-app',
    nodeState: 'running',
    hasChildren: true,
    hasOpenPr: true,
  },
];

describe('FeatureRowActionsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders FeatureRowActions portals for discovered containers', () => {
    const container = createContainerWithPortalTargets(['feat-1', 'feat-2']);

    render(
      <FeatureRowActionsManager
        tableContainer={container}
        features={sampleFeatures}
        inFlightIds={new Set()}
        {...defaultCallbacks}
      />
    );

    // FeatureRowActions renders a button with aria-label="Actions" for states with actions
    const actionButtons = screen.getAllByRole('button', { name: 'Actions' });
    expect(actionButtons.length).toBe(2);

    document.body.removeChild(container);
  });

  it('does not render portals when tableContainer is null', () => {
    render(
      <FeatureRowActionsManager
        tableContainer={null}
        features={sampleFeatures}
        inFlightIds={new Set()}
        {...defaultCallbacks}
      />
    );

    const actionButtons = screen.queryAllByRole('button', { name: 'Actions' });
    expect(actionButtons.length).toBe(0);
  });

  it('does not render portals for features without nodeState', () => {
    const featuresWithoutState: FeatureTreeRow[] = [
      {
        id: 'feat-no-state',
        name: 'No State Feature',
        status: 'pending',
        lifecycle: 'Planning',
        branch: 'feat/no-state',
        repositoryName: 'my-app',
        // nodeState is undefined
      },
    ];

    const container = createContainerWithPortalTargets(['feat-no-state']);

    render(
      <FeatureRowActionsManager
        tableContainer={container}
        features={featuresWithoutState}
        inFlightIds={new Set()}
        {...defaultCallbacks}
      />
    );

    const actionButtons = screen.queryAllByRole('button', { name: 'Actions' });
    expect(actionButtons.length).toBe(0);

    document.body.removeChild(container);
  });

  it('finds features nested in _children for grouped data', () => {
    const groupedFeatures: FeatureTreeRow[] = [
      {
        id: 'group-status-done',
        name: 'Done',
        status: 'done',
        lifecycle: '',
        branch: '',
        repositoryName: '',
        _isGroupHeader: true,
        _groupCount: 1,
        _children: [sampleFeatures[0]],
      },
    ];

    const container = createContainerWithPortalTargets(['feat-1']);

    render(
      <FeatureRowActionsManager
        tableContainer={container}
        features={groupedFeatures}
        inFlightIds={new Set()}
        {...defaultCallbacks}
      />
    );

    const actionButtons = screen.getAllByRole('button', { name: 'Actions' });
    expect(actionButtons.length).toBe(1);

    document.body.removeChild(container);
  });

  it('cleans up portals when component unmounts', () => {
    const container = createContainerWithPortalTargets(['feat-1']);

    const { unmount } = render(
      <FeatureRowActionsManager
        tableContainer={container}
        features={sampleFeatures}
        inFlightIds={new Set()}
        {...defaultCallbacks}
      />
    );

    expect(screen.getAllByRole('button', { name: 'Actions' }).length).toBe(1);

    unmount();

    // After unmount, the portal target should be empty
    const target = container.querySelector('[data-feature-id="feat-1"]');
    expect(target?.children.length).toBe(0);

    document.body.removeChild(container);
  });
});
