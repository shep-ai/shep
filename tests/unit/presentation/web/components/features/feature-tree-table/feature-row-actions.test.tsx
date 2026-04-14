import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeatureRowActions } from '@/components/features/feature-tree-table/feature-row-actions';
import type { FeatureRowActionsProps } from '@/components/features/feature-tree-table/feature-row-actions';

function makeProps(overrides: Partial<FeatureRowActionsProps> = {}): FeatureRowActionsProps {
  return {
    featureId: 'feat-123',
    featureName: 'Test Feature',
    nodeState: 'pending',
    hasChildren: false,
    hasOpenPr: false,
    isLoading: false,
    onStart: vi.fn(),
    onStop: vi.fn(),
    onRetry: vi.fn(),
    onReview: vi.fn(),
    onArchive: vi.fn(),
    onUnarchive: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
}

describe('FeatureRowActions', () => {
  it('renders a three-dot button for pending state', () => {
    render(<FeatureRowActions {...makeProps({ nodeState: 'pending' })} />);
    expect(screen.getByRole('button', { name: /actions/i })).toBeInTheDocument();
  });

  it('does not render anything for creating state', () => {
    const { container } = render(<FeatureRowActions {...makeProps({ nodeState: 'creating' })} />);
    expect(container.firstChild).toBeNull();
  });

  it('does not render anything for deleting state', () => {
    const { container } = render(<FeatureRowActions {...makeProps({ nodeState: 'deleting' })} />);
    expect(container.firstChild).toBeNull();
  });

  it('calls onStart with featureId when Start menu item is clicked', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<FeatureRowActions {...makeProps({ nodeState: 'pending', onStart })} />);

    await user.click(screen.getByRole('button', { name: /actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /start/i }));

    expect(onStart).toHaveBeenCalledWith('feat-123');
  });

  it('calls onStop with featureId when Stop menu item is clicked', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(<FeatureRowActions {...makeProps({ nodeState: 'running', onStop })} />);

    await user.click(screen.getByRole('button', { name: /actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /stop/i }));

    expect(onStop).toHaveBeenCalledWith('feat-123');
  });

  it('calls onRetry with featureId when Retry menu item is clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<FeatureRowActions {...makeProps({ nodeState: 'error', onRetry })} />);

    await user.click(screen.getByRole('button', { name: /actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /retry/i }));

    expect(onRetry).toHaveBeenCalledWith('feat-123');
  });

  it('calls onReview with featureId when Review menu item is clicked', async () => {
    const user = userEvent.setup();
    const onReview = vi.fn();
    render(<FeatureRowActions {...makeProps({ nodeState: 'action-required', onReview })} />);

    await user.click(screen.getByRole('button', { name: /actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /review/i }));

    expect(onReview).toHaveBeenCalledWith('feat-123');
  });

  it('calls onUnarchive with featureId when Unarchive menu item is clicked', async () => {
    const user = userEvent.setup();
    const onUnarchive = vi.fn();
    render(<FeatureRowActions {...makeProps({ nodeState: 'archived', onUnarchive })} />);

    await user.click(screen.getByRole('button', { name: /actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /unarchive/i }));

    expect(onUnarchive).toHaveBeenCalledWith('feat-123');
  });

  it('calls onDelete with featureId when Delete menu item is clicked', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<FeatureRowActions {...makeProps({ nodeState: 'pending', onDelete })} />);

    await user.click(screen.getByRole('button', { name: /actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /delete/i }));

    expect(onDelete).toHaveBeenCalledWith('feat-123');
  });

  it('calls onArchive with featureId when Archive menu item is clicked', async () => {
    const user = userEvent.setup();
    const onArchive = vi.fn();
    render(<FeatureRowActions {...makeProps({ nodeState: 'pending', onArchive })} />);

    await user.click(screen.getByRole('button', { name: /actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /archive/i }));

    expect(onArchive).toHaveBeenCalledWith('feat-123');
  });

  it('shows a spinner when isLoading is true', () => {
    render(<FeatureRowActions {...makeProps({ isLoading: true })} />);
    const button = screen.getByRole('button', { name: /actions/i });
    expect(button).toBeInTheDocument();
    expect(button.querySelector('.animate-spin')).toBeTruthy();
  });

  it('disables the button when isLoading is true', () => {
    render(<FeatureRowActions {...makeProps({ isLoading: true })} />);
    const button = screen.getByRole('button', { name: /actions/i });
    expect(button).toBeDisabled();
  });

  it('shows correct menu items for each state', async () => {
    const user = userEvent.setup();

    // Test done state: should have Archive and Delete
    const { unmount } = render(<FeatureRowActions {...makeProps({ nodeState: 'done' })} />);
    await user.click(screen.getByRole('button', { name: /actions/i }));

    const menuItems = screen.getAllByRole('menuitem');
    const labels = menuItems.map((item) => item.textContent?.trim());
    expect(labels).toEqual(['Archive', 'Delete']);

    unmount();
  });

  it('shows correct menu items for archived state', async () => {
    const user = userEvent.setup();
    render(<FeatureRowActions {...makeProps({ nodeState: 'archived' })} />);
    await user.click(screen.getByRole('button', { name: /actions/i }));

    const menuItems = screen.getAllByRole('menuitem');
    const labels = menuItems.map((item) => item.textContent?.trim());
    expect(labels).toEqual(['Unarchive', 'Delete']);
  });
});
