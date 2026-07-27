import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorktreeSettingsSection } from '@/components/features/settings/worktree-settings-section';
import { DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS } from '@shepai/core/domain/shared/worktree-config';

const mockUpdateSettingsAction = vi.fn();

vi.mock('@/app/actions/update-settings', () => ({
  updateSettingsAction: (...args: unknown[]) => mockUpdateSettingsAction(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('WorktreeSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSettingsAction.mockResolvedValue({ success: true });
  });

  it('renders both command inputs empty when nothing is configured', () => {
    render(<WorktreeSettingsSection />);

    expect((screen.getByTestId('worktree-create-command') as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByTestId('worktree-post-create-command') as HTMLTextAreaElement).value).toBe(
      ''
    );
  });

  it('defaults the timeout input to the shared default', () => {
    render(<WorktreeSettingsSection />);

    expect((screen.getByTestId('worktree-command-timeout') as HTMLInputElement).value).toBe(
      String(DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS)
    );
  });

  it('renders configured values', () => {
    render(
      <WorktreeSettingsSection
        worktree={{
          createCommand: 'my-tool create',
          postCreateCommand: 'ln -s ../node_modules .',
          commandTimeoutMs: 60000,
        }}
      />
    );

    expect((screen.getByTestId('worktree-create-command') as HTMLTextAreaElement).value).toBe(
      'my-tool create'
    );
    expect((screen.getByTestId('worktree-post-create-command') as HTMLTextAreaElement).value).toBe(
      'ln -s ../node_modules .'
    );
    expect((screen.getByTestId('worktree-command-timeout') as HTMLInputElement).value).toBe(
      '60000'
    );
  });

  it('saves the post-create command on blur', async () => {
    render(<WorktreeSettingsSection />);
    const input = screen.getByTestId('worktree-post-create-command');

    fireEvent.change(input, { target: { value: 'pnpm install --offline' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockUpdateSettingsAction).toHaveBeenCalledWith({
        worktree: { postCreateCommand: 'pnpm install --offline' },
      });
    });
  });

  it('does not save when the value is unchanged', () => {
    render(<WorktreeSettingsSection worktree={{ createCommand: 'my-tool create' }} />);

    fireEvent.blur(screen.getByTestId('worktree-create-command'));

    expect(mockUpdateSettingsAction).not.toHaveBeenCalled();
  });

  it('saves an empty create command so the built-in git worktree is restored', async () => {
    render(<WorktreeSettingsSection worktree={{ createCommand: 'my-tool create' }} />);
    const input = screen.getByTestId('worktree-create-command');

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockUpdateSettingsAction).toHaveBeenCalledWith({ worktree: { createCommand: '' } });
    });
  });

  it('falls back to the default timeout when given an invalid value', async () => {
    render(<WorktreeSettingsSection worktree={{ commandTimeoutMs: 60000 }} />);
    const input = screen.getByTestId('worktree-command-timeout');

    fireEvent.change(input, { target: { value: 'nonsense' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockUpdateSettingsAction).toHaveBeenCalledWith({
        worktree: { commandTimeoutMs: DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS },
      });
    });
    expect((input as HTMLInputElement).value).toBe(String(DEFAULT_WORKTREE_COMMAND_TIMEOUT_MS));
  });
});
