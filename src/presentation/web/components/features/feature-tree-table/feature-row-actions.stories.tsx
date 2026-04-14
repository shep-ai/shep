import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { FeatureRowActions } from './feature-row-actions';

const meta: Meta<typeof FeatureRowActions> = {
  title: 'Features/FeatureRowActions',
  component: FeatureRowActions,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  args: {
    featureId: 'feat-abc-123',
    featureName: 'Authentication System',
    hasChildren: false,
    hasOpenPr: false,
    isLoading: false,
    onStart: fn().mockName('onStart'),
    onStop: fn().mockName('onStop'),
    onRetry: fn().mockName('onRetry'),
    onReview: fn().mockName('onReview'),
    onArchive: fn().mockName('onArchive'),
    onUnarchive: fn().mockName('onUnarchive'),
    onDelete: fn().mockName('onDelete'),
  },
};

export default meta;
type Story = StoryObj<typeof FeatureRowActions>;

/** Pending state — shows Start, Archive, Delete actions. */
export const Pending: Story = {
  args: { nodeState: 'pending' },
};

/** Running state — shows Stop, Archive, Delete actions. */
export const Running: Story = {
  args: { nodeState: 'running' },
};

/** Error state — shows Retry, Archive, Delete actions. */
export const Error: Story = {
  args: { nodeState: 'error' },
};

/** Action Required state — shows Review, Archive, Delete actions. */
export const ActionRequired: Story = {
  args: { nodeState: 'action-required' },
};

/** Done state — shows Archive, Delete actions. */
export const Done: Story = {
  args: { nodeState: 'done' },
};

/** Blocked state — shows Archive, Delete actions. */
export const Blocked: Story = {
  args: { nodeState: 'blocked' },
};

/** Archived state — shows Unarchive, Delete actions. */
export const Archived: Story = {
  args: { nodeState: 'archived' },
};

/** Creating state — renders nothing (transient state). */
export const Creating: Story = {
  args: { nodeState: 'creating' },
};

/** Deleting state — renders nothing (transient state). */
export const Deleting: Story = {
  args: { nodeState: 'deleting' },
};

/** Loading state — button shows spinner and is disabled. */
export const Loading: Story = {
  args: { nodeState: 'pending', isLoading: true },
};

/** Feature with child features — affects delete dialog cascade option. */
export const WithChildren: Story = {
  args: { nodeState: 'done', hasChildren: true },
};

/** Feature with open pull request — affects delete dialog close-PR option. */
export const WithOpenPr: Story = {
  args: { nodeState: 'done', hasOpenPr: true },
};
