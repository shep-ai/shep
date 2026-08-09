import type { Meta, StoryObj } from '@storybook/react';

import { RunPlanSource } from '@shepai/core/domain/generated/output';
import {
  RunPlanOverrideField,
  type DevServerRunPlanView,
} from '@shepai/core/application/use-cases/deployments/dev-server-run-plan-vocabulary';
import { RunPlanEditor } from './run-plan-editor';

function makePlan(overrides: Partial<DevServerRunPlanView> = {}): DevServerRunPlanView {
  return {
    repoPath: '/repos/acme',
    command: 'pnpm dev',
    cwd: '/repos/acme',
    source: RunPlanSource.Deterministic,
    setupCommands: [],
    isStale: false,
    ...overrides,
  };
}

const meta: Meta<typeof RunPlanEditor> = {
  title: 'ApplicationPage/RunPlan/RunPlanEditor',
  component: RunPlanEditor,
  parameters: { layout: 'padded' },
  args: {
    onSubmit: () => undefined,
    onCancel: () => undefined,
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 480 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof RunPlanEditor>;

/**
 * **Editing** — seeded from the resolved plan so the user changes only what
 * they mean to. The execution notice is always visible: the command is
 * spawned verbatim on their machine.
 */
export const Editing: Story = {
  args: { plan: makePlan() },
};

/**
 * **Empty** — nothing has been resolved for this target yet, so the form
 * starts blank rather than inventing a command to seed with.
 */
export const Empty: Story = {
  args: { plan: null },
};

/**
 * **Validation error** — every rejection comes from the use case, keyed to
 * its field. The component itself validates nothing, so the CLI and the web
 * surface cannot disagree about what is acceptable.
 */
export const ValidationError: Story = {
  args: {
    plan: makePlan({ command: '', cwd: '/etc' }),
    errors: [
      { field: RunPlanOverrideField.Command, message: 'A dev server command is required.' },
      {
        field: RunPlanOverrideField.Cwd,
        message: 'The working directory must be inside /repos/acme.',
      },
    ],
  },
};

/**
 * **Save failed** — the override never reached the use case (the action
 * itself failed), which is a different thing from being rejected by it.
 */
export const SaveFailed: Story = {
  args: {
    plan: makePlan(),
    errorMessage: 'Could not save the run plan.',
  },
};

/**
 * **Repo-config controlled** — a committed `.shep/dev.json` is re-read on
 * every start, so a stored override could never take effect. The form is
 * inert and says why, rather than accepting input that would do nothing.
 */
export const RepoConfigControlled: Story = {
  args: {
    plan: makePlan({ command: 'docker compose up', source: RunPlanSource.Manual }),
    repoConfigControlled: true,
  },
};

/** **Submitting** — the save is in flight; the form cannot be re-submitted. */
export const Submitting: Story = {
  args: { plan: makePlan(), submitting: true },
};
