import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BaseDrawer } from '@/components/common/base-drawer';

vi.mock('@/hooks/feature-flags-context', () => ({
  useFeatureFlags: () => ({ envDeploy: true, debug: false }),
}));

const mockDeployAction = {
  deploy: vi.fn(),
  stop: vi.fn(),
  deployLoading: false,
  stopLoading: false,
  deployError: null,
  status: null as string | null,
  url: null as string | null,
};

vi.mock('@/hooks/use-deploy-action', () => ({
  useDeployAction: () => mockDeployAction,
}));

vi.mock('@/components/common/deployment-status-badge', () => ({
  DeploymentStatusBadge: ({ status, targetId }: { status: string | null; targetId?: string }) =>
    status ? (
      <div data-testid="deployment-status-badge" data-status={status} data-target-id={targetId} />
    ) : null,
}));

describe('BaseDrawer', () => {
  beforeEach(() => {
    mockDeployAction.status = null;
    mockDeployAction.url = null;
  });

  describe('rendering', () => {
    it('renders children content when open=true', () => {
      render(
        <BaseDrawer open onClose={vi.fn()}>
          <p>Drawer content</p>
        </BaseDrawer>
      );
      expect(screen.getByText('Drawer content')).toBeInTheDocument();
    });

    it('does not render content when open=false', () => {
      render(
        <BaseDrawer open={false} onClose={vi.fn()}>
          <p>Drawer content</p>
        </BaseDrawer>
      );
      expect(document.querySelector('[data-slot="drawer-content"]')).not.toBeInTheDocument();
    });
  });

  describe('close button', () => {
    it('calls onClose on click', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <BaseDrawer open onClose={onClose}>
          <p>Content</p>
        </BaseDrawer>
      );

      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('has aria-label="Close" and sr-only "Close" text', () => {
      render(
        <BaseDrawer open onClose={vi.fn()}>
          <p>Content</p>
        </BaseDrawer>
      );

      const closeButton = screen.getByRole('button', { name: /close/i });
      expect(closeButton).toHaveAttribute('aria-label', 'Close');
      expect(closeButton.querySelector('.sr-only')).toHaveTextContent('Close');
    });

    it('has data-testid={testid}-close-button when data-testid provided', () => {
      render(
        <BaseDrawer open onClose={vi.fn()} data-testid="my-drawer">
          <p>Content</p>
        </BaseDrawer>
      );

      expect(screen.getByTestId('my-drawer-close-button')).toBeInTheDocument();
    });
  });

  describe('size variants', () => {
    it('applies w-96 class when size="sm"', () => {
      render(
        <BaseDrawer open onClose={vi.fn()} size="sm" data-testid="drawer">
          <p>Content</p>
        </BaseDrawer>
      );

      const content = screen.getByTestId('drawer');
      expect(content.className).toContain('w-96');
    });

    it('applies w-2xl class when size="md"', () => {
      render(
        <BaseDrawer open onClose={vi.fn()} size="md" data-testid="drawer">
          <p>Content</p>
        </BaseDrawer>
      );

      const content = screen.getByTestId('drawer');
      expect(content.className).toContain('w-2xl');
    });

    it('defaults to sm (w-96) when no size prop is provided', () => {
      render(
        <BaseDrawer open onClose={vi.fn()} data-testid="drawer">
          <p>Content</p>
        </BaseDrawer>
      );

      const content = screen.getByTestId('drawer');
      expect(content.className).toContain('w-96');
    });
  });

  describe('modal', () => {
    it('renders DrawerOverlay when modal=true', () => {
      render(
        <BaseDrawer open onClose={vi.fn()} modal>
          <p>Content</p>
        </BaseDrawer>
      );

      expect(document.querySelector('[data-slot="drawer-overlay"]')).toBeInTheDocument();
    });

    it('does not render DrawerOverlay when modal=false (default)', () => {
      render(
        <BaseDrawer open onClose={vi.fn()}>
          <p>Content</p>
        </BaseDrawer>
      );

      expect(document.querySelector('[data-slot="drawer-overlay"]')).not.toBeInTheDocument();
    });
  });

  describe('header slot', () => {
    it('renders header content inside DrawerHeader when provided', () => {
      render(
        <BaseDrawer open onClose={vi.fn()} header={<h2>My Header</h2>}>
          <p>Content</p>
        </BaseDrawer>
      );

      expect(screen.getByText('My Header')).toBeInTheDocument();
      expect(document.querySelector('[data-slot="drawer-header"]')).toBeInTheDocument();
    });

    it('does not render DrawerHeader when header prop is omitted', () => {
      render(
        <BaseDrawer open onClose={vi.fn()}>
          <p>Content</p>
        </BaseDrawer>
      );

      expect(document.querySelector('[data-slot="drawer-header"]')).not.toBeInTheDocument();
    });
  });

  describe('footer slot', () => {
    it('renders footer content inside DrawerFooter when provided', () => {
      render(
        <BaseDrawer open onClose={vi.fn()} footer={<button type="button">Save</button>}>
          <p>Content</p>
        </BaseDrawer>
      );

      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(document.querySelector('[data-slot="drawer-footer"]')).toBeInTheDocument();
    });

    it('does not render DrawerFooter when footer prop is omitted', () => {
      render(
        <BaseDrawer open onClose={vi.fn()}>
          <p>Content</p>
        </BaseDrawer>
      );

      expect(document.querySelector('[data-slot="drawer-footer"]')).not.toBeInTheDocument();
    });
  });

  describe('content area layout', () => {
    it('renders children inside a flex-1 min-h-0 flex-col container', () => {
      render(
        <BaseDrawer open onClose={vi.fn()} data-testid="drawer">
          <p>Content</p>
        </BaseDrawer>
      );

      const content = screen.getByText('Content');
      const contentArea = content.parentElement;
      expect(contentArea?.className).toContain('flex-1');
      expect(contentArea?.className).toContain('min-h-0');
      expect(contentArea?.className).toContain('flex-col');
    });

    it('renders header and footer as siblings of the content area', () => {
      render(
        <BaseDrawer
          open
          onClose={vi.fn()}
          header={<h2>Test Header</h2>}
          footer={<button type="button">Test Footer</button>}
        >
          <p>Content</p>
        </BaseDrawer>
      );

      const content = screen.getByText('Content');
      const contentArea = content.parentElement;

      const header = screen.getByText('Test Header').closest('[data-slot="drawer-header"]');
      const footer = screen.getByText('Test Footer').closest('[data-slot="drawer-footer"]');

      // Header and footer should be siblings of content area (not children)
      expect(header?.parentElement).toBe(contentArea?.parentElement);
      expect(footer?.parentElement).toBe(contentArea?.parentElement);

      // Header and footer are shrink-0 so they don't compress
      expect(header?.className).toContain('shrink-0');
      expect(footer?.className).toContain('shrink-0');

      // Content area fills remaining space
      expect(contentArea?.className).toContain('min-h-0');
    });
  });

  describe('deployTarget', () => {
    it('renders deploy bar when deployTarget is provided', () => {
      render(
        <BaseDrawer
          open
          onClose={vi.fn()}
          deployTarget={{
            targetId: 'f1',
            targetType: 'feature',
            repositoryPath: '/repo',
            branch: 'main',
          }}
        >
          <p>Content</p>
        </BaseDrawer>
      );

      expect(screen.getByTestId('base-drawer-deploy-bar')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /start dev server/i })).toBeInTheDocument();
    });

    it('passes targetId to DeploymentStatusBadge when deployment is active', () => {
      mockDeployAction.status = 'Ready';
      mockDeployAction.url = 'http://localhost:3000';

      render(
        <BaseDrawer
          open
          onClose={vi.fn()}
          deployTarget={{
            targetId: 'f1',
            targetType: 'feature',
            repositoryPath: '/repo',
            branch: 'main',
          }}
        >
          <p>Content</p>
        </BaseDrawer>
      );

      const badge = screen.getByTestId('deployment-status-badge');
      expect(badge).toHaveAttribute('data-target-id', 'f1');
    });

    it('does not render deploy bar when deployTarget is omitted', () => {
      render(
        <BaseDrawer open onClose={vi.fn()}>
          <p>Content</p>
        </BaseDrawer>
      );

      expect(screen.queryByTestId('base-drawer-deploy-bar')).not.toBeInTheDocument();
    });
  });

  describe('className passthrough', () => {
    it('merges custom className onto DrawerContent', () => {
      render(
        <BaseDrawer open onClose={vi.fn()} className="custom-class" data-testid="drawer">
          <p>Content</p>
        </BaseDrawer>
      );

      const content = screen.getByTestId('drawer');
      expect(content.className).toContain('custom-class');
    });
  });

  describe('data-testid', () => {
    it('propagates data-testid to DrawerContent', () => {
      render(
        <BaseDrawer open onClose={vi.fn()} data-testid="feature-drawer">
          <p>Content</p>
        </BaseDrawer>
      );

      expect(screen.getByTestId('feature-drawer')).toBeInTheDocument();
    });
  });
});
