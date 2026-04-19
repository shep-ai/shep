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
        renderTick={0}
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
        renderTick={0}
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
        renderTick={0}
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
        renderTick={0}
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
        renderTick={0}
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

  it('renders action buttons for mixed-state features (all actionable states)', () => {
    const mixedFeatures: FeatureTreeRow[] = [
      {
        id: 'feat-pending',
        name: 'Pending Feature',
        status: 'pending',
        lifecycle: 'Pending',
        branch: 'feat/pending',
        repositoryName: 'repo',
        nodeState: 'pending',
      },
      {
        id: 'feat-running',
        name: 'Running Feature',
        status: 'in-progress',
        lifecycle: 'Implementation',
        branch: 'feat/running',
        repositoryName: 'repo',
        nodeState: 'running',
      },
      {
        id: 'feat-error',
        name: 'Error Feature',
        status: 'error',
        lifecycle: 'Implementation',
        branch: 'feat/error',
        repositoryName: 'repo',
        nodeState: 'error',
      },
      {
        id: 'feat-done',
        name: 'Done Feature',
        status: 'done',
        lifecycle: 'Maintain',
        branch: 'feat/done',
        repositoryName: 'repo',
        nodeState: 'done',
      },
      {
        id: 'feat-archived',
        name: 'Archived Feature',
        status: 'done',
        lifecycle: 'Archived',
        branch: 'feat/archived',
        repositoryName: 'repo',
        nodeState: 'archived',
      },
    ];

    const container = createContainerWithPortalTargets([
      'feat-pending',
      'feat-running',
      'feat-error',
      'feat-done',
      'feat-archived',
    ]);

    render(
      <FeatureRowActionsManager
        tableContainer={container}
        renderTick={0}
        features={mixedFeatures}
        inFlightIds={new Set()}
        {...defaultCallbacks}
      />
    );

    // All 5 features have actionable states, so 5 action buttons
    const actionButtons = screen.getAllByRole('button', { name: 'Actions' });
    expect(actionButtons.length).toBe(5);

    document.body.removeChild(container);
  });

  it('does not render actions for creating/deleting features even with portal targets', () => {
    const transientFeatures: FeatureTreeRow[] = [
      {
        id: 'feat-creating',
        name: 'Creating Feature',
        status: 'pending',
        lifecycle: 'Started',
        branch: 'feat/creating',
        repositoryName: 'repo',
        nodeState: 'creating',
      },
      {
        id: 'feat-deleting',
        name: 'Deleting Feature',
        status: 'blocked',
        lifecycle: 'Deleting',
        branch: 'feat/deleting',
        repositoryName: 'repo',
        nodeState: 'deleting',
      },
    ];

    const container = createContainerWithPortalTargets(['feat-creating', 'feat-deleting']);

    render(
      <FeatureRowActionsManager
        tableContainer={container}
        renderTick={0}
        features={transientFeatures}
        inFlightIds={new Set()}
        {...defaultCallbacks}
      />
    );

    // FeatureRowActions returns null for creating/deleting — no buttons should render
    const actionButtons = screen.queryAllByRole('button', { name: 'Actions' });
    expect(actionButtons.length).toBe(0);

    document.body.removeChild(container);
  });

  it('only disables the in-flight row, not other rows', () => {
    const container = createContainerWithPortalTargets(['feat-1', 'feat-2']);

    render(
      <FeatureRowActionsManager
        tableContainer={container}
        renderTick={0}
        features={sampleFeatures}
        inFlightIds={new Set(['feat-1'])}
        {...defaultCallbacks}
      />
    );

    const actionButtons = screen.getAllByRole('button', { name: 'Actions' });
    expect(actionButtons.length).toBe(2);

    // Find the disabled (in-flight) button and enabled button
    const disabledButtons = actionButtons.filter((btn) => btn.hasAttribute('disabled'));
    const enabledButtons = actionButtons.filter((btn) => !btn.hasAttribute('disabled'));

    expect(disabledButtons.length).toBe(1);
    expect(enabledButtons.length).toBe(1);

    // The disabled button should have a spinner
    expect(disabledButtons[0].querySelector('.animate-spin')).toBeTruthy();

    document.body.removeChild(container);
  });

  it('handles features in both flat and nested _children', () => {
    const nestedFeatures: FeatureTreeRow[] = [
      {
        id: 'group-repo',
        name: 'my-app',
        status: 'pending',
        lifecycle: '',
        branch: '',
        repositoryName: 'my-app',
        _isRepoGroup: true,
        _featureCount: 2,
        _children: [
          {
            id: 'feat-nested-1',
            name: 'Nested Feature 1',
            status: 'done',
            lifecycle: 'Maintain',
            branch: 'feat/nested-1',
            repositoryName: 'my-app',
            nodeState: 'done',
          },
          {
            id: 'feat-nested-2',
            name: 'Nested Feature 2',
            status: 'error',
            lifecycle: 'Implementation',
            branch: 'feat/nested-2',
            repositoryName: 'my-app',
            nodeState: 'error',
          },
        ],
      },
    ];

    const container = createContainerWithPortalTargets(['feat-nested-1', 'feat-nested-2']);

    render(
      <FeatureRowActionsManager
        tableContainer={container}
        renderTick={0}
        features={nestedFeatures}
        inFlightIds={new Set()}
        {...defaultCallbacks}
      />
    );

    const actionButtons = screen.getAllByRole('button', { name: 'Actions' });
    expect(actionButtons.length).toBe(2);

    document.body.removeChild(container);
  });
});
