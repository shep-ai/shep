import type { Meta, StoryObj } from '@storybook/react';
import { FactoryPageClient } from './factory-page-client';
import { PROJECTS, QUIET_RUN, RUN, SPACES, STATUS } from './factory-fixtures';

const meta: Meta<typeof FactoryPageClient> = {
  title: 'Features/Factory/FactoryPageClient',
  component: FactoryPageClient,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  args: { spaces: SPACES, projects: PROJECTS },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { status: STATUS, runs: [RUN, QUIET_RUN] } };

export const LoadError: Story = { args: { runs: [], loadError: 'No space "acme".' } };
