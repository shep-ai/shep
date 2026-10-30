import type { Meta, StoryObj } from '@storybook/react';
import { LearningPageClient } from './learning-page-client';
import { CANDIDATE_DETAIL, EMPTY_HISTORY, HISTORY, REPOSITORIES } from './learning-fixtures';

const meta: Meta<typeof LearningPageClient> = {
  title: 'Features/Learning/LearningPageClient',
  component: LearningPageClient,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof LearningPageClient>;

/** A repository with an adopted version, a candidate to decide on, and a lesson. */
export const Default: Story = {
  args: { repositories: REPOSITORIES, history: HISTORY, detail: CANDIDATE_DETAIL },
};

/** Learning is on but nothing has been learned in this repository yet. */
export const Empty: Story = { args: { repositories: REPOSITORIES, history: EMPTY_HISTORY } };

/** The page loaded its repositories but not yet a history to show. */
export const Loading: Story = { args: { repositories: REPOSITORIES } };

/** Reading the learned harness failed. */
export const Error: Story = {
  args: { repositories: REPOSITORIES, loadError: 'SQLITE_BUSY: database is locked' },
};

/** No repository added to Shep yet. */
export const NoRepositories: Story = { args: { repositories: [] } };
