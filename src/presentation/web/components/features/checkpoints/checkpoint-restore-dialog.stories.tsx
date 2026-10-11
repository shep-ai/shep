import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { CheckpointRestoreDialog } from './checkpoint-restore-dialog';
import { fixtureCheckpoints } from './checkpoint-fixtures';

const meta: Meta<typeof CheckpointRestoreDialog> = {
  title: 'Features/Checkpoints/CheckpointRestoreDialog',
  component: CheckpointRestoreDialog,
  tags: ['autodocs'],
  args: { checkpoint: fixtureCheckpoints[2], onConfirm: fn(), onCancel: fn() },
};

export default meta;
type Story = StoryObj<typeof CheckpointRestoreDialog>;

/** Asking before rolling the worktree back to "plan". */
export const Default: Story = {};

/** The restore is in flight: buttons are disabled. */
export const Pending: Story = { args: { pending: true } };

/** No checkpoint chosen: the dialog is closed. */
export const Closed: Story = { args: { checkpoint: null } };
