import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ControlCenterOnboarding } from '@/components/features/control-center/control-center-onboarding';
import { isAgentSetupComplete } from '@/app/actions/agent-setup-flag';
import { checkAgentAuth } from '@/app/actions/check-agent-auth';

vi.mock('@/app/actions/agent-setup-flag', () => ({ isAgentSetupComplete: vi.fn() }));
vi.mock('@/app/actions/check-agent-auth', () => ({ checkAgentAuth: vi.fn() }));
vi.mock('@/app/actions/check-tool-status', () => ({
  checkToolStatus: vi.fn().mockResolvedValue({ git: { installed: true }, gh: { installed: true } }),
}));
vi.mock('@/components/features/control-center/welcome-agent-setup', () => ({
  WelcomeAgentSetup: () => <div>Choose agent</div>,
}));
vi.mock('@/components/features/control-center/new-project-dialog', () => ({
  NewProjectDialog: () => null,
}));
vi.mock('@/components/common/react-file-manager-dialog', () => ({
  ReactFileManagerDialog: () => null,
}));
vi.mock('@/hooks/feature-flags-context', () => ({
  useFeatureFlags: () => ({ reactFileManager: true }),
}));

const auth = {
  agentType: 'cursor',
  label: 'Cursor CLI',
  installed: true,
  authenticated: false,
  binaryName: 'cursor-agent',
  installCommand: null,
  authCommand: 'cursor-agent login',
};

describe('Control Center onboarding recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAgentSetupComplete).mockResolvedValue(true);
    vi.mocked(checkAgentAuth).mockResolvedValue(auth);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  it('announces setup loading instead of leaving an empty page', () => {
    vi.mocked(isAgentSetupComplete).mockReturnValueOnce(
      new Promise(() => {
        /* Keep the loading state pending. */
      })
    );
    render(<ControlCenterOnboarding />);
    expect(screen.getByRole('status')).toHaveTextContent('Checking setup');
  });

  it('offers a spec-driven new project from a prompt on first run (issue 896)', async () => {
    const onStartFromPrompt = vi.fn();
    render(<ControlCenterOnboarding onStartFromPrompt={onStartFromPrompt} />);

    const button = await screen.findByTestId('empty-state-start-from-prompt');
    expect(button).toHaveTextContent('Start from a prompt');
    await userEvent.click(button);

    expect(onStartFromPrompt).toHaveBeenCalledTimes(1);
  });

  it('hides the prompt entry point when the surface cannot open it', async () => {
    render(<ControlCenterOnboarding />);

    await screen.findByTestId('empty-state-add-repository');
    expect(screen.queryByTestId('empty-state-start-from-prompt')).not.toBeInTheDocument();
  });

  it('launches the catalog tool id for Cursor', async () => {
    render(<ControlCenterOnboarding />);
    await userEvent.click(await screen.findByTestId('auth-banner-open-terminal'));
    expect(fetch).toHaveBeenCalledWith('/api/tools/cursor-cli/launch', { method: 'POST' });
  });

  it('reports launch failure and lets the user retry', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    render(<ControlCenterOnboarding />);
    await userEvent.click(await screen.findByTestId('auth-banner-open-terminal'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to open/i);
    await userEvent.click(screen.getByTestId('auth-banner-open-terminal'));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps authentication retry available after a transport failure', async () => {
    vi.mocked(checkAgentAuth)
      .mockResolvedValueOnce(auth)
      .mockRejectedValueOnce(new Error('Connection lost'))
      .mockResolvedValue(auth);
    render(<ControlCenterOnboarding />);
    await userEvent.click(await screen.findByRole('button', { name: 'Re-check' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost');
    await userEvent.click(screen.getByRole('button', { name: 'Re-check' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(checkAgentAuth).toHaveBeenCalledTimes(3);
  });
});
