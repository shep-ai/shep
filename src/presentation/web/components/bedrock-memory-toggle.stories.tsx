import type { Meta, StoryObj } from '@storybook/react';

import { BedrockMemoryToggle } from './bedrock-memory-toggle';
import type { EnableBedrockResult } from '@/app/actions/enable-bedrock.action';

const meta: Meta<typeof BedrockMemoryToggle> = {
  title: 'Components/BedrockMemoryToggle',
  component: BedrockMemoryToggle,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: '420px', padding: '1rem' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof BedrockMemoryToggle>;

const successAction = async (): Promise<EnableBedrockResult> => ({
  ok: true,
  bedrockEnabled: true,
});

const pendingAction = (): Promise<EnableBedrockResult> => new Promise(() => undefined);

const errorAction = async (): Promise<EnableBedrockResult> => ({
  ok: false,
  code: 'PIPX_NOT_INSTALLED',
  remediation:
    'Install pipx with `brew install pipx && pipx ensurepath`, then reopen your terminal.',
});

export const Default: Story = {
  args: {
    applicationId: 'app-default',
    initialEnabled: false,
    enableActionOverride: successAction,
  },
};

export const Loading: Story = {
  args: {
    applicationId: 'app-loading',
    initialEnabled: false,
    enableActionOverride: pendingAction,
  },
  play: async ({ canvasElement }) => {
    const sw = canvasElement.querySelector<HTMLButtonElement>(
      '[data-testid="bedrock-memory-toggle"]'
    );
    sw?.click();
  },
};

export const Error: Story = {
  args: {
    applicationId: 'app-error',
    initialEnabled: false,
    enableActionOverride: errorAction,
  },
  play: async ({ canvasElement }) => {
    const sw = canvasElement.querySelector<HTMLButtonElement>(
      '[data-testid="bedrock-memory-toggle"]'
    );
    sw?.click();
  },
};
