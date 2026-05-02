import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentModelPicker } from '@/components/features/settings/AgentModelPicker';

const mockGetAllAgentModels = vi.fn();
const mockUpdateAgentAndModel = vi.fn();

vi.mock('@/app/actions/get-all-agent-models', () => ({
  getAllAgentModels: (...args: unknown[]) => mockGetAllAgentModels(...args),
}));

vi.mock('@/app/actions/update-agent-and-model', () => ({
  updateAgentAndModel: (...args: unknown[]) => mockUpdateAgentAndModel(...args),
}));

vi.mock('@/components/ui/popover', async () => {
  const React = await import('react');
  return {
    Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

const groups = [
  {
    agentType: 'claude-code',
    label: 'Claude Code',
    models: [
      {
        id: 'claude-sonnet-4-6',
        displayName: 'Sonnet 4.6',
        description: 'Fast & balanced',
      },
    ],
  },
  {
    agentType: 'codex-cli',
    label: 'Codex CLI',
    models: [
      {
        id: 'gpt-5.4',
        displayName: 'GPT-5.4',
        description: 'Latest reasoning model',
      },
    ],
  },
];

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function ControlledRollbackHarness({
  onSave,
}: {
  onSave: (agentType: string, modelId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [selection, setSelection] = React.useState({
    agentType: 'claude-code',
    model: 'claude-sonnet-4-6',
  });
  const [saveError, setSaveError] = React.useState<string | null>(null);

  return (
    <AgentModelPicker
      initialAgentType="claude-code"
      initialModel="claude-sonnet-4-6"
      agentType={selection.agentType}
      model={selection.model}
      saveError={saveError}
      onSave={async (agentType, modelId) => {
        const previousSelection = selection;
        setSelection({ agentType, model: modelId });
        setSaveError(null);

        const result = await onSave(agentType, modelId);
        if (!result.ok) {
          setSelection(previousSelection);
          setSaveError(result.error ?? 'Failed to save');
        }
        return result;
      }}
      mode="settings"
    />
  );
}

describe('AgentModelPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllAgentModels.mockResolvedValue(groups);
    mockUpdateAgentAndModel.mockResolvedValue({ ok: true });
  });

  it('re-syncs to parent-supplied agent and model values after initial render', async () => {
    const { rerender } = render(
      <AgentModelPicker
        initialAgentType="claude-code"
        initialModel="claude-sonnet-4-6"
        agentType="claude-code"
        model="claude-sonnet-4-6"
        mode="settings"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveTextContent('Claude Code');
      expect(screen.getByRole('combobox')).toHaveTextContent('Sonnet 4.6');
    });

    rerender(
      <AgentModelPicker
        initialAgentType="claude-code"
        initialModel="claude-sonnet-4-6"
        agentType="codex-cli"
        model="gpt-5.4"
        mode="settings"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveTextContent('Codex CLI');
      expect(screen.getByRole('combobox')).toHaveTextContent('GPT 5.4');
    });
  });

  it('can be disabled while a save is in flight', async () => {
    render(
      <AgentModelPicker
        initialAgentType="claude-code"
        initialModel="claude-sonnet-4-6"
        mode="settings"
        saving
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeDisabled();
    });
  });

  it('rolls back to parent-supplied values after a failed save', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<{ ok: boolean; error?: string }>();
    const onSave = vi.fn().mockReturnValue(deferred.promise);

    render(<ControlledRollbackHarness onSave={onSave} />);

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveTextContent('Claude Code');
      expect(screen.getByRole('combobox')).toHaveTextContent('Sonnet 4.6');
    });

    await user.click(screen.getByRole('button', { name: /Codex CLI/i }));
    await user.click(await screen.findByRole('button', { name: /GPT-5.4/i }));

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveTextContent('Codex CLI');
      expect(screen.getByRole('combobox')).toHaveTextContent('GPT 5.4');
    });

    deferred.resolve({ ok: false, error: 'Could not save pinned config' });

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveTextContent('Claude Code');
      expect(screen.getByRole('combobox')).toHaveTextContent('Sonnet 4.6');
      expect(screen.getByText('Could not save pinned config')).toBeInTheDocument();
    });
  });

  // Regression: in `mode="override"`, the picker MUST notify its
  // parent of the active selection on mount. Without this, a parent
  // that initialises its override state to `undefined` (the empty
  // create-application composer is the canonical example) would
  // silently leave the value unset when the user did not interact
  // with the picker, and the eventual `createApplication` call would
  // fall back to the global `settings.agent.type` resolver — which
  // can resolve to a non-interactive agent (e.g. `dev`) and crash
  // the interactive session boot. "What you see in the picker" must
  // equal "what gets sent" even with zero clicks.
  it('fires onAgentModelChange on mount in override mode so parent state matches the displayed value', async () => {
    const onAgentModelChange = vi.fn();

    render(
      <AgentModelPicker
        initialAgentType="claude-code"
        initialModel="claude-sonnet-4-6"
        onAgentModelChange={onAgentModelChange}
        mode="override"
      />
    );

    await waitFor(() => {
      expect(onAgentModelChange).toHaveBeenCalledWith('claude-code', 'claude-sonnet-4-6');
    });
  });

  it('does NOT fire onAgentModelChange on mount in settings mode (settings mode persists explicit user selections only)', async () => {
    const onAgentModelChange = vi.fn();

    render(
      <AgentModelPicker
        initialAgentType="claude-code"
        initialModel="claude-sonnet-4-6"
        onAgentModelChange={onAgentModelChange}
        mode="settings"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveTextContent('Claude Code');
    });

    expect(onAgentModelChange).not.toHaveBeenCalled();
  });

  it('keeps override mode local and does not attempt persistence', async () => {
    const user = userEvent.setup();
    const onAgentModelChange = vi.fn();
    const onSave = vi.fn();

    render(
      <AgentModelPicker
        initialAgentType="claude-code"
        initialModel="claude-sonnet-4-6"
        onAgentModelChange={onAgentModelChange}
        onSave={onSave}
        mode="override"
      />
    );

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveTextContent('Claude Code');
    });

    await user.click(screen.getByRole('button', { name: /Codex CLI/i }));
    await user.click(await screen.findByRole('button', { name: /GPT-5.4/i }));

    await waitFor(() => {
      expect(screen.getByRole('combobox')).toHaveTextContent('Codex CLI');
      expect(screen.getByRole('combobox')).toHaveTextContent('GPT 5.4');
    });

    expect(onAgentModelChange).toHaveBeenCalledWith('codex-cli', 'gpt-5.4');
    expect(onSave).not.toHaveBeenCalled();
    expect(mockUpdateAgentAndModel).not.toHaveBeenCalled();
  });
});
