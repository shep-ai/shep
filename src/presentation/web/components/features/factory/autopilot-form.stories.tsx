import type { Meta, StoryObj } from '@storybook/react';
import { AutopilotForm } from './autopilot-form';
import { PROJECTS, STATUS, runInStory } from './factory-fixtures';

const meta: Meta<typeof AutopilotForm> = {
  title: 'Features/Factory/AutopilotForm',
  component: AutopilotForm,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { space: 'space-acme', projects: PROJECTS, run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const On: Story = { args: { policy: STATUS.autopilot.policy } };

const { projectId: _project, ...withoutProject } = STATUS.autopilot.policy;

/** The default: everything off. */
export const Off: Story = {
  args: {
    policy: { ...withoutProject, investigateUrgent: false, fixConfident: false, fillLine: false },
  },
};
