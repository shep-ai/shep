import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentType, RuntimeActionKind, type Space } from '@shepai/core/domain/generated/output';
import { SpaceAgentSettingsForm } from '@/components/features/spaces/space-agent-settings-form';

const configureSpaceAgent = vi.fn();
vi.mock('@/app/actions/manage-spaces', () => ({
  configureSpaceAgent: (...a: unknown[]) => configureSpaceAgent(...a),
}));

const T = new Date('2026-10-01T00:00:00Z');
const ACME: Space = {
  id: 's-acme',
  name: 'Acme',
  slug: 'acme',
  isDefault: false,
  agentSettings: {
    ghConfigDir: '/home/me/.config/gh-acme',
    useBedrock: true,
    allowedAgentTypes: [AgentType.ClaudeCode],
  },
  createdAt: T,
  updatedAt: T,
};
const PLAIN: Space = { ...ACME, id: 's-plain', agentSettings: undefined };

const run = vi.fn(async (action: () => Promise<{ ok: boolean }>) => (await action()).ok);

describe('SpaceAgentSettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureSpaceAgent.mockResolvedValue({ ok: true });
  });

  it('starts collapsed and says whether the space has settings', () => {
    render(<SpaceAgentSettingsForm space={ACME} run={run} />);
    expect(screen.queryByTestId('agent-settings-gh')).not.toBeInTheDocument();
    expect(screen.getByTestId('space-agent-settings-toggle')).toHaveTextContent('Customised');
  });

  it('opens with the current values', async () => {
    render(<SpaceAgentSettingsForm space={ACME} run={run} />);
    await userEvent.click(screen.getByTestId('space-agent-settings-toggle'));
    expect(screen.getByTestId('agent-settings-gh')).toHaveValue('/home/me/.config/gh-acme');
    expect(screen.getByTestId('agent-settings-bedrock')).toHaveValue('on');
    expect(screen.getByTestId(`agent-settings-agent-${AgentType.ClaudeCode}`)).toBeChecked();
    expect(screen.getByTestId(`agent-settings-agent-${AgentType.Cursor}`)).not.toBeChecked();
  });

  it('saves every field, clearing the empty ones', async () => {
    render(<SpaceAgentSettingsForm space={ACME} run={run} />);
    await userEvent.click(screen.getByTestId('space-agent-settings-toggle'));
    await userEvent.clear(screen.getByTestId('agent-settings-gh'));
    await userEvent.type(screen.getByTestId('agent-settings-git-email'), 'me@acme.com');
    await userEvent.selectOptions(screen.getByTestId('agent-settings-bedrock'), 'off');
    await userEvent.click(screen.getByTestId(`agent-settings-agent-${AgentType.Cursor}`));
    await userEvent.click(screen.getByTestId('agent-settings-submit'));

    expect(configureSpaceAgent).toHaveBeenCalledWith(ACME.id, {
      claudeConfigDir: null,
      ghConfigDir: null,
      gitAuthorName: null,
      gitAuthorEmail: 'me@acme.com',
      awsProfile: null,
      useBedrock: false,
      allowedAgentTypes: [AgentType.ClaudeCode, AgentType.Cursor],
      prCommentTrigger: 'Mention',
      prCommentResolveThreads: false,
      autoRuntimeActions: [],
      docsFirst: false,
      docsPaths: null,
    });
  });

  it('saves docs first with its documentation paths (spec 131)', async () => {
    render(<SpaceAgentSettingsForm space={ACME} run={run} />);
    await userEvent.click(screen.getByTestId('space-agent-settings-toggle'));
    expect(screen.getByTestId('agent-settings-docs-paths')).toBeDisabled();
    await userEvent.click(screen.getByTestId('agent-settings-docs-first'));
    await userEvent.type(screen.getByTestId('agent-settings-docs-paths'), 'docs/, CHANGES.md');
    await userEvent.click(screen.getByTestId('agent-settings-submit'));
    expect(configureSpaceAgent).toHaveBeenCalledWith(
      ACME.id,
      expect.objectContaining({ docsFirst: true, docsPaths: ['docs/', 'CHANGES.md'] })
    );
  });

  it('saves which runtime actions shep runs on incidents unasked (spec 129)', async () => {
    const space = { ...ACME, agentSettings: { autoRuntimeActions: [RuntimeActionKind.Restart] } };
    render(<SpaceAgentSettingsForm space={space} run={run} />);
    await userEvent.click(screen.getByTestId('space-agent-settings-toggle'));
    expect(screen.getByTestId(`agent-settings-auto-${RuntimeActionKind.Restart}`)).toBeChecked();
    await userEvent.click(screen.getByTestId(`agent-settings-auto-${RuntimeActionKind.Scale}`));
    await userEvent.click(screen.getByTestId(`agent-settings-auto-${RuntimeActionKind.Restart}`));
    await userEvent.click(screen.getByTestId('agent-settings-submit'));
    expect(configureSpaceAgent).toHaveBeenCalledWith(
      ACME.id,
      expect.objectContaining({ autoRuntimeActions: [RuntimeActionKind.Scale] })
    );
  });

  it('saves which PR comments shep answers and thread resolution (spec 124)', async () => {
    render(<SpaceAgentSettingsForm space={ACME} run={run} />);
    await userEvent.click(screen.getByTestId('space-agent-settings-toggle'));
    expect(screen.getByTestId('agent-settings-pr-trigger')).toHaveValue('Mention');
    await userEvent.selectOptions(screen.getByTestId('agent-settings-pr-trigger'), 'All');
    await userEvent.click(screen.getByTestId('agent-settings-resolve-threads'));
    await userEvent.click(screen.getByTestId('agent-settings-submit'));
    expect(configureSpaceAgent).toHaveBeenCalledWith(
      ACME.id,
      expect.objectContaining({ prCommentTrigger: 'All', prCommentResolveThreads: true })
    );
  });

  it('saves inherit for Bedrock as a clear', async () => {
    render(<SpaceAgentSettingsForm space={PLAIN} run={run} />);
    expect(screen.getByTestId('space-agent-settings-toggle')).toHaveTextContent(
      'Inherits the host'
    );
    await userEvent.click(screen.getByTestId('space-agent-settings-toggle'));
    await userEvent.click(screen.getByTestId('agent-settings-submit'));
    expect(configureSpaceAgent).toHaveBeenCalledWith(
      PLAIN.id,
      expect.objectContaining({ useBedrock: null, allowedAgentTypes: [] })
    );
  });
});
