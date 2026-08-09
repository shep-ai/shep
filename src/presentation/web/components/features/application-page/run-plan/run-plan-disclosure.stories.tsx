import type { Meta, StoryObj } from '@storybook/react';
import { within, expect } from '@storybook/test';

import { DeploymentTargetType } from '@shepai/core/domain/generated/output';
import { RunPlanDisclosure } from './run-plan-disclosure';

/**
 * Storybook aliases `@/app/actions` module-wide, so the backend condition a
 * story wants is selected by target id — see
 * `.storybook/mocks/app/actions/get-dev-server-run-plan.ts`.
 */
const TARGET = {
  Default: 'story-default',
  NoPlan: 'story-no-plan',
  Stale: 'story-stale',
  RepoConfigControlled: 'story-repo-config',
  LoadError: 'story-load-error',
};

const meta: Meta<typeof RunPlanDisclosure> = {
  title: 'ApplicationPage/RunPlan/RunPlanDisclosure',
  component: RunPlanDisclosure,
  parameters: { layout: 'padded' },
  args: { targetType: DeploymentTargetType.Application, targetId: TARGET.Default },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof RunPlanDisclosure>;

/**
 * **Collapsed** — the default. One row of chrome, and no query is issued
 * until the user actually asks what will run.
 */
export const Collapsed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByTestId('run-plan-body')).not.toBeInTheDocument();
  },
};

/** **Expanded** — the resolved plan, with Edit and Re-analyze available. */
export const Expanded: Story = {
  args: { defaultOpen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByTestId('run-plan-command')).toBeInTheDocument();
  },
};

/**
 * **Stale** — a pinned plan whose repository config changed underneath it.
 * The hint sits beside Re-analyze; nothing is replaced behind the user's back.
 */
export const Stale: Story = {
  args: { defaultOpen: true, targetId: TARGET.Stale },
};

/** **Editing** — the override form, opened over the resolved plan. */
export const Editing: Story = {
  args: { defaultOpen: true, defaultEditing: true },
};

/**
 * **Repo-config controlled** — a committed `.shep/dev.json` is in charge, so
 * Edit is disabled and the summary explains why.
 */
export const RepoConfigControlled: Story = {
  args: { defaultOpen: true, targetId: TARGET.RepoConfigControlled },
};

/** **No plan** — nothing resolved yet for this target. */
export const NoPlan: Story = {
  args: { defaultOpen: true, targetId: TARGET.NoPlan },
};

/**
 * **Load error** — the target could not be resolved, so the disclosure says
 * so rather than showing a plan it cannot vouch for.
 */
export const LoadError: Story = {
  args: { defaultOpen: true, targetId: TARGET.LoadError },
};
