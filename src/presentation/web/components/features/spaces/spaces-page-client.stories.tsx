import type { Meta, StoryObj } from '@storybook/react';
import { SpacesPageClient } from './spaces-page-client';
import { OVERVIEW, PERSONAL } from './spaces-fixtures';

const meta: Meta<typeof SpacesPageClient> = {
  title: 'Features/Spaces/SpacesPageClient',
  component: SpacesPageClient,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const PersonalAndWork: Story = {
  args: { overview: OVERVIEW },
};

/** A fresh install: only the default space, nothing placed yet. */
export const FreshInstall: Story = {
  args: {
    overview: {
      spaces: [
        { space: PERSONAL, productLines: [], rules: [], memoryCount: 0, repositoryCount: 0 },
      ],
      repositories: [],
    },
  },
};

export const LoadError: Story = {
  args: {
    overview: { spaces: [], repositories: [] },
    loadError: 'The Shep database could not be opened.',
  },
};
