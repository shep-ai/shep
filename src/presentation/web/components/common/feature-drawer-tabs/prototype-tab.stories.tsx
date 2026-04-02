import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { PrototypeTab } from './prototype-tab';
import type { FeatureNodeData } from '@/components/common/feature-node';
import { FeatureMode } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof PrototypeTab> = {
  title: 'Drawers/Feature/PrototypeTab',
  component: PrototypeTab,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<typeof PrototypeTab>;

const baseExplorationData: FeatureNodeData = {
  name: 'Workspace grouping prototype',
  description: 'Explore different UI approaches for grouping repos into workspaces',
  featureId: 'abc123',
  lifecycle: 'exploring',
  state: 'action-required',
  progress: 0,
  repositoryPath: '/home/user/project',
  branch: 'feat/explore-workspace-grouping',
  mode: FeatureMode.Exploration,
  iterationCount: 1,
};

/** First iteration — prototype just generated, awaiting feedback. */
export const FirstIteration: Story = {
  args: {
    data: { ...baseExplorationData, iterationCount: 1 },
    onSubmitFeedback: fn(),
    onPromote: fn(),
    onDiscard: fn(),
  },
};

/** Mid-iteration — user has given multiple rounds of feedback. */
export const MidIteration: Story = {
  args: {
    data: { ...baseExplorationData, iterationCount: 5 },
    onSubmitFeedback: fn(),
    onPromote: fn(),
    onDiscard: fn(),
  },
};

/** Generating — the agent is currently producing a prototype. */
export const Generating: Story = {
  args: {
    data: { ...baseExplorationData, state: 'running', iterationCount: 3 },
    onSubmitFeedback: fn(),
    onPromote: fn(),
    onDiscard: fn(),
  },
};

/** Submitting feedback — loading state while feedback is being sent. */
export const Submitting: Story = {
  args: {
    data: { ...baseExplorationData, iterationCount: 2 },
    onSubmitFeedback: fn(),
    onPromote: fn(),
    onDiscard: fn(),
    isSubmitting: true,
  },
};

/** Zero iterations — just created, no prototype yet. */
export const ZeroIterations: Story = {
  args: {
    data: { ...baseExplorationData, state: 'running', iterationCount: 0 },
    onSubmitFeedback: fn(),
    onPromote: fn(),
    onDiscard: fn(),
  },
};
