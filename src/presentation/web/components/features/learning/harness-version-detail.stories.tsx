import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { LearnedHarnessStatus } from '@shepai/core/domain/generated/output';
import { HarnessVersionDetailView } from './harness-version-detail';
import { ADOPTED, CANDIDATE_DETAIL } from './learning-fixtures';

const meta: Meta<typeof HarnessVersionDetailView> = {
  title: 'Features/Learning/HarnessVersionDetailView',
  component: HarnessVersionDetailView,
  tags: ['autodocs'],
  args: { onAdopt: fn(), onReject: fn() },
};

export default meta;
type Story = StoryObj<typeof HarnessVersionDetailView>;

/** A candidate that adds a script: the runs-code warning and adopt / reject show. */
export const Default: Story = { args: { detail: CANDIDATE_DETAIL } };

/** An action on the version is in flight. */
export const Loading: Story = { args: { detail: CANDIDATE_DETAIL, busy: true } };

/** A rejected version keeps the person's reason; nothing more can be done with it. */
export const Error: Story = {
  args: {
    detail: {
      ...CANDIDATE_DETAIL,
      version: {
        ...CANDIDATE_DETAIL.version,
        status: LearnedHarnessStatus.Rejected,
        statusReason: 'The script needs a database the CI runner does not have',
      },
    },
  },
};

/** The version in use: no actions here (rollback is in the page header). */
export const Adopted: Story = {
  args: { detail: { ...CANDIDATE_DETAIL, version: ADOPTED, edits: [] } },
};
