import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { ErrorRecoveryBanner } from './error-recovery-banner';

const meta: Meta<typeof ErrorRecoveryBanner> = {
  title: 'Features/Chat/ErrorRecoveryBanner',
  component: ErrorRecoveryBanner,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
};

export default meta;
type Story = StoryObj<typeof ErrorRecoveryBanner>;

/** Setup crashed and can be re-run — shows the "Try again" button. */
export const SetupFailed: Story = {
  args: {
    state: {
      kind: 'Setup failed',
      message:
        'The last setup run errored out before it could finish. Click Try again to re-run the failed step, or open the Smart Deploy activity log from the top bar to see what went wrong.',
      retryable: true,
    },
    onRetry: fn(),
  },
};

/** Setup failed at boot with a known reason — shown under the explanation. */
export const SetupFailedWithReason: Story = {
  args: {
    state: {
      kind: 'Setup failed',
      message:
        'The last setup run errored out before it could finish. Click Try again to re-run the failed step, or open the Smart Deploy activity log from the top bar to see what went wrong.',
      retryable: true,
      detail: 'cursor-agent is not logged in. Run `cursor-agent login`, then try again.',
    },
    onRetry: fn(),
  },
};

/**
 * The application's agent cannot run chat sessions. Retrying would fail the
 * same way, so the banner links to Settings instead of offering "Try again".
 */
export const ChatUnavailableForAgent: Story = {
  args: {
    state: {
      kind: 'Chat unavailable for Gemini CLI',
      message:
        'Gemini CLI does not support chat sessions yet, so this app cannot run setup or chat with it. To keep chatting, pick another agent in the message box. New apps use the default agent from Settings.',
      retryable: false,
      action: { label: 'Open Settings', href: '/settings' },
    },
  },
};

/** A non-retryable failure with nothing for the user to act on. */
export const NotRetryable: Story = {
  args: {
    state: {
      kind: 'Interrupted',
      message: 'The setup run was interrupted.',
      retryable: false,
    },
  },
};
