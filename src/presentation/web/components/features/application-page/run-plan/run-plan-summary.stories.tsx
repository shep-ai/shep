import type { Meta, StoryObj } from '@storybook/react';

import { RunPlanSource } from '@shepai/core/domain/generated/output';
import type { DevServerRunPlanView } from '@shepai/core/application/use-cases/deployments/dev-server-run-plan-vocabulary';
import { RunPlanSummary } from './run-plan-summary';

function makePlan(overrides: Partial<DevServerRunPlanView> = {}): DevServerRunPlanView {
  return {
    repoPath: '/repos/acme',
    command: 'pnpm dev',
    cwd: '/repos/acme',
    source: RunPlanSource.Deterministic,
    packageManager: 'pnpm',
    setupCommands: [],
    isStale: false,
    ...overrides,
  };
}

const meta: Meta<typeof RunPlanSummary> = {
  title: 'ApplicationPage/RunPlan/RunPlanSummary',
  component: RunPlanSummary,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 480 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof RunPlanSummary>;

/**
 * **Default** — a deterministically detected Node plan, the overwhelmingly
 * common case. Optional fields the detector did not populate are absent
 * rather than rendered blank.
 */
export const Default: Story = {
  args: { plan: makePlan() },
};

/**
 * **Rich** — a non-Node plan carrying everything a detector can supply:
 * language, framework, an explicitly declared port and setup commands.
 */
export const Rich: Story = {
  args: {
    plan: makePlan({
      command: 'go run ./cmd/server',
      cwd: '/repos/acme/services/api',
      source: RunPlanSource.Agent,
      language: 'Go',
      framework: 'Echo',
      expectedPort: 8080,
      packageManager: undefined,
      setupCommands: ['go mod download'],
    }),
  },
};

/**
 * **Stale** — the repository's config files changed after the plan was
 * produced. Reported, never acted on: the hint sits next to the Re-analyze
 * action rather than replacing the plan behind the user's back.
 */
export const Stale: Story = {
  args: { plan: makePlan({ isStale: true }) },
};

/**
 * **Manual source** — a plan the user pinned. It survives config drift and
 * start failures, which is exactly what the badge is telling them.
 */
export const ManualSource: Story = {
  args: {
    plan: makePlan({
      command: 'make dev-with-fixtures',
      source: RunPlanSource.Manual,
      isStale: true,
    }),
  },
};

/**
 * **Repo-config controlled** — a committed `.shep/dev.json` is re-read on
 * every start and outranks the stored row, so the summary says so.
 */
export const RepoConfigControlled: Story = {
  args: {
    plan: makePlan({ command: 'docker compose up', source: RunPlanSource.Manual }),
    repoConfigControlled: true,
  },
};

/**
 * **No plan** — nothing has been resolved for this target yet. The empty
 * state points at the one action that produces one: starting the dev server.
 */
export const NoPlan: Story = {
  args: { plan: null },
};
