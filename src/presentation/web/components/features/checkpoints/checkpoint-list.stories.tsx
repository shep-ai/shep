import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { GitCheckpointKind } from '@shepai/core/domain/generated/output';
import { CheckpointList } from './checkpoint-list';
import { fixtureCheckpoints } from './checkpoint-fixtures';

const meta: Meta<typeof CheckpointList> = {
  title: 'Features/Checkpoints/CheckpointList',
  component: CheckpointList,
  tags: ['autodocs'],
  args: {
    checkpoints: fixtureCheckpoints,
    selectedSequence: 3,
    onSelect: fn(),
    onRestore: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof CheckpointList>;

/** The steps of a full spec-driven run, "implement" selected. */
export const Default: Story = {};

/** Core reported a blocker (an agent is running): restore buttons are disabled. */
export const RestoreDisabled: Story = { args: { restoreDisabled: true } };

/** After a restore: the snapshot taken just before it is labelled. */
export const WithPreRestore: Story = {
  args: {
    checkpoints: [
      ...fixtureCheckpoints,
      {
        ...fixtureCheckpoints[4],
        id: 'cp-5',
        sequence: 5,
        kind: GitCheckpointKind.PreRestore,
        node: 'pre-restore',
      },
    ],
    selectedSequence: 5,
  },
};

/** Read-only: no restore action. */
export const WithoutRestore: Story = { args: { onRestore: undefined } };
