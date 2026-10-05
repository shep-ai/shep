import type { Meta, StoryObj } from '@storybook/react';
import { userEvent, within } from '@storybook/test';
import { AgentType, RuntimeActionKind } from '@shepai/core/domain/generated/output';
import { SpaceAgentSettingsForm } from './space-agent-settings-form';
import { ACME, PERSONAL, runInStory } from './spaces-fixtures';

const meta: Meta<typeof SpaceAgentSettingsForm> = {
  title: 'Features/Spaces/SpaceAgentSettingsForm',
  component: SpaceAgentSettingsForm,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { run: runInStory },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const WORK = {
  ...ACME,
  agentSettings: {
    claudeConfigDir: '/home/dev/.claude-acme',
    ghConfigDir: '/home/dev/.config/gh-acme',
    gitAuthorName: 'Dev',
    gitAuthorEmail: 'dev@acme.com',
    useBedrock: true,
    awsProfile: 'acme',
    allowedAgentTypes: [AgentType.ClaudeCode],
    autoRuntimeActions: [RuntimeActionKind.Restart],
  },
};

/** Collapsed: the badge says the space inherits the host. */
export const Inherits: Story = {
  args: { space: PERSONAL },
};

/** Collapsed: the badge says the space has its own settings. */
export const Customised: Story = {
  args: { space: WORK },
};

export const OpenWithWorkLogins: Story = {
  args: { space: WORK },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByTestId('space-agent-settings-toggle'));
  },
};
