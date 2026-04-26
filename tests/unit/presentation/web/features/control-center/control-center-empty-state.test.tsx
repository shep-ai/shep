import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  createApplication: vi.fn(() => Promise.resolve({ application: { id: 'app-123' } })),
}));

import { createProjectAndFeature } from '@/app/actions/create-project-and-feature';
import { createApplication } from '@/app/actions/create-application';
import { ControlCenterEmptyState } from '@/components/features/control-center/control-center-empty-state';

const mockedCreateProjectAndFeature = vi.mocked(createProjectAndFeature);
const mockedCreateApplication = vi.mocked(createApplication);

function Wrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}

describe('ControlCenterEmptyState', () => {
  beforeEach(() => {
    mockedCreateProjectAndFeature.mockClear();
    mockedCreateApplication.mockClear();
    mockedCreateApplication.mockResolvedValue({
      application: { id: 'app-123' } as never,
    });
    mockedCreateProjectAndFeature.mockResolvedValue({
      feature: { id: 'f-1', name: 'test', description: 'test' } as never,
      repositoryPath: '/tmp/test',
    });
  });

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

  it('hides the build-mode dropdown when onRepositorySelect is not provided (apps-only surface)', () => {
    render(<ControlCenterEmptyState onApplicationCreated={vi.fn()} />, { wrapper: Wrapper });

    expect(screen.queryByTestId('build-mode-selector')).not.toBeInTheDocument();
  });

  it('always submits via createApplication on the apps-only surface', async () => {
    const user = userEvent.setup();

    render(<ControlCenterEmptyState onApplicationCreated={vi.fn()} />, { wrapper: Wrapper });

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'A landing page with hero and pricing');
    await user.keyboard('{Meta>}{Enter}{/Meta}');

    await waitFor(() => {
      expect(mockedCreateApplication).toHaveBeenCalledTimes(1);
      expect(mockedCreateProjectAndFeature).not.toHaveBeenCalled();
    });
  });

  it('shows the build-mode dropdown when onRepositorySelect IS provided (canvas surface)', () => {
    render(<ControlCenterEmptyState onRepositorySelect={vi.fn()} />, { wrapper: Wrapper });

    expect(screen.getByTestId('build-mode-selector')).toBeInTheDocument();
  });

  it('routes fast mode through createProjectAndFeature when onRepositorySelect IS provided', async () => {
    const user = userEvent.setup();
    const onRepoSelect = vi.fn();

    render(<ControlCenterEmptyState onRepositorySelect={onRepoSelect} />, { wrapper: Wrapper });

    // Switch to fast mode via the dropdown
    const modeSelector = screen.getByTestId('build-mode-selector');
    await user.click(modeSelector);
    const fastOption = screen.getByTestId('build-mode-fast');
    await user.click(fastOption);

    // Type a description and submit
    const textarea = screen.getByRole('textbox');
    await user.type(textarea, 'Add pagination to the users list');
    await user.keyboard('{Meta>}{Enter}{/Meta}');

    await waitFor(() => {
      expect(mockedCreateProjectAndFeature).toHaveBeenCalledTimes(1);
      expect(mockedCreateApplication).not.toHaveBeenCalled();
    });
  });
});
