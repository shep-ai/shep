import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DeploymentState } from '@shepai/core/domain/generated/output';
import { DeploymentStatusBadge } from '@/components/common/deployment-status-badge';

// Mock the ServerLogViewer component
vi.mock('@/components/common/server-log-viewer', () => ({
  ServerLogViewer: ({
    open,
    targetId,
  }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    targetId: string;
  }) => (open ? <div data-testid="server-log-viewer" data-target-id={targetId} /> : null),
}));

describe('DeploymentStatusBadge', () => {
  it('renders spinning loader badge when status is Booting', () => {
    const { container } = render(<DeploymentStatusBadge status={DeploymentState.Booting} />);

    expect(screen.getByText('Starting...')).toBeInTheDocument();
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
    const blueIcon = container.querySelector('[class*="text-blue"]');
    expect(blueIcon).toBeInTheDocument();
  });

  it('renders spinning loader badge with "Analyzing..." when status is Analyzing', () => {
    const { container } = render(<DeploymentStatusBadge status={DeploymentState.Analyzing} />);

    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders spinning loader badge with "Installing..." when status is Installing', () => {
    const { container } = render(<DeploymentStatusBadge status={DeploymentState.Installing} />);

    expect(screen.getByText('Installing...')).toBeInTheDocument();
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders green badge with clickable URL when status is Ready', () => {
    const { container } = render(
      <DeploymentStatusBadge status={DeploymentState.Ready} url="http://localhost:3000" />
    );

    const link = screen.getByRole('link', { name: /localhost:3000/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'http://localhost:3000');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    const badge = container.querySelector('[class*="bg-green"]');
    expect(badge).toBeInTheDocument();
  });

  it('renders "Ready" text when status is Ready but no URL', () => {
    render(<DeploymentStatusBadge status={DeploymentState.Ready} />);

    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('renders nothing when status is Stopped', () => {
    const { container } = render(<DeploymentStatusBadge status={DeploymentState.Stopped} />);

    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when status is null', () => {
    const { container } = render(<DeploymentStatusBadge status={null} />);

    expect(container.innerHTML).toBe('');
  });

  describe('View Logs button', () => {
    it('does not render log button when targetId is undefined', () => {
      render(<DeploymentStatusBadge status={DeploymentState.Booting} />);

      expect(screen.queryByRole('button', { name: /view server logs/i })).not.toBeInTheDocument();
    });

    it('renders log button when status is Booting and targetId is provided', () => {
      render(<DeploymentStatusBadge status={DeploymentState.Booting} targetId="my-target" />);

      expect(screen.getByRole('button', { name: /view server logs/i })).toBeInTheDocument();
    });

    it('renders log button when status is Analyzing and targetId is provided', () => {
      render(<DeploymentStatusBadge status={DeploymentState.Analyzing} targetId="my-target" />);

      expect(screen.getByRole('button', { name: /view server logs/i })).toBeInTheDocument();
    });

    it('renders log button when status is Installing and targetId is provided', () => {
      render(<DeploymentStatusBadge status={DeploymentState.Installing} targetId="my-target" />);

      expect(screen.getByRole('button', { name: /view server logs/i })).toBeInTheDocument();
    });

    it('renders log button when status is Ready and targetId is provided', () => {
      render(
        <DeploymentStatusBadge
          status={DeploymentState.Ready}
          url="http://localhost:3000"
          targetId="my-target"
        />
      );

      expect(screen.getByRole('button', { name: /view server logs/i })).toBeInTheDocument();
    });

    it('does not render log button when status is null even with targetId', () => {
      render(<DeploymentStatusBadge status={null} targetId="my-target" />);

      expect(screen.queryByRole('button', { name: /view server logs/i })).not.toBeInTheDocument();
    });

    it('does not render log button when status is Stopped even with targetId', () => {
      render(<DeploymentStatusBadge status={DeploymentState.Stopped} targetId="my-target" />);

      expect(screen.queryByRole('button', { name: /view server logs/i })).not.toBeInTheDocument();
    });

    it('button has correct aria-label', () => {
      render(<DeploymentStatusBadge status={DeploymentState.Ready} targetId="my-target" />);

      expect(screen.getByRole('button', { name: /view server logs/i })).toHaveAttribute(
        'aria-label',
        'View server logs'
      );
    });

    it('clicking the button opens the log viewer dialog', () => {
      render(
        <DeploymentStatusBadge
          status={DeploymentState.Ready}
          url="http://localhost:3000"
          targetId="my-target"
        />
      );

      expect(screen.queryByTestId('server-log-viewer')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /view server logs/i }));

      expect(screen.getByTestId('server-log-viewer')).toBeInTheDocument();
      expect(screen.getByTestId('server-log-viewer')).toHaveAttribute(
        'data-target-id',
        'my-target'
      );
    });

    it('clicking the button in Booting state opens the log viewer dialog', () => {
      render(<DeploymentStatusBadge status={DeploymentState.Booting} targetId="boot-target" />);

      fireEvent.click(screen.getByRole('button', { name: /view server logs/i }));

      expect(screen.getByTestId('server-log-viewer')).toBeInTheDocument();
      expect(screen.getByTestId('server-log-viewer')).toHaveAttribute(
        'data-target-id',
        'boot-target'
      );
    });
  });
});
