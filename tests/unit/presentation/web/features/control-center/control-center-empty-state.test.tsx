import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@/app/actions/get-all-agent-models', () => ({
  getAllAgentModels: vi.fn(() =>
    Promise.resolve([
      {
        agentType: 'claude-code',
        label: 'Claude Code',
        models: [{ id: 'opus-4', displayName: 'Opus 4', description: 'Best' }],
      },
    ])
  ),
}));

vi.mock('@/app/actions/update-agent-and-model', () => ({
  updateAgentAndModel: vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock('@/app/actions/check-all-agents-status', () => ({
  checkAllAgentsStatus: vi.fn(() => Promise.resolve({ 'claude-code': true, dev: true })),
}));

vi.mock('@/components/common/feature-node/agent-type-icons', () => ({
  getAgentTypeIcon: () => {
    function MockIcon(props: Record<string, unknown>) {
      return <span data-testid="agent-icon" {...props} />;
    }
    return MockIcon;
  },
}));

vi.mock('@/lib/model-metadata', () => ({
  getModelMeta: (id: string) => ({
    displayName: id,
    description: `Description for ${id}`,
  }),
}));

vi.mock('next/image', () => ({
  default: function MockImage(props: Record<string, unknown>) {
    return <img {...props} />;
  },
}));

vi.mock('@/app/actions/create-project-and-feature', () => ({
  createProjectAndFeature: vi.fn(() => Promise.resolve({ error: 'Not available in test' })),
}));

vi.mock('@/app/actions/create-application', () => ({
  createApplication: vi.fn(() => Promise.resolve({ error: 'Not available in test' })),
}));

import { ControlCenterEmptyState } from '@/components/features/control-center/control-center-empty-state';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

describe('ControlCenterEmptyState', () => {
  it('renders the prompt-first onboarding page directly', async () => {
    render(<ControlCenterEmptyState />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText('What do you want to build?')).toBeInTheDocument();
    });
  });

  it('renders Shep logo', () => {
    render(<ControlCenterEmptyState />, { wrapper: Wrapper });
    expect(screen.getByTestId('control-center-empty-state')).toBeInTheDocument();
  });

  it('renders suggestion chips', async () => {
    render(<ControlCenterEmptyState />, { wrapper: Wrapper });

    await waitFor(() => {
      expect(screen.getByText(/landing page/i)).toBeInTheDocument();
      expect(screen.getByText(/SaaS app/i)).toBeInTheDocument();
    });
  });

  it('applies custom className', () => {
    render(<ControlCenterEmptyState className="custom-class" />, { wrapper: Wrapper });
    expect(screen.getByTestId('control-center-empty-state')).toHaveClass('custom-class');
  });
});
