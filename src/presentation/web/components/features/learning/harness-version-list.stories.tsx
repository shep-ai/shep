import type { Meta, StoryObj } from '@storybook/react';
import { HarnessVersionTrend } from '@shepai/core/domain/generated/output';
import { HarnessVersionList } from './harness-version-list';
import { CANDIDATE, HISTORY } from './learning-fixtures';

const meta: Meta<typeof HarnessVersionList> = {
  title: 'Features/Learning/HarnessVersionList',
  component: HarnessVersionList,
  tags: ['autodocs'],
  args: { hrefFor: (id: string) => `/learning?version=${id}` },
};

export default meta;
type Story = StoryObj<typeof HarnessVersionList>;

/** A candidate waiting, the adopted version (improved) and an older regressed one. */
export const Default: Story = {
  args: { versions: HISTORY.versions, selectedId: CANDIDATE.id },
};

/** No version learned yet. */
export const Empty: Story = { args: { versions: [] } };

/** The adopted version is doing worse than its parent: the regression flag shows. */
export const Regressed: Story = {
  args: {
    versions: HISTORY.versions.map((v) => ({ ...v, trend: HarnessVersionTrend.Regressed })),
  },
};

/** Versions without outcome data yet ("loading" metrics: not enough runs). */
export const Loading: Story = {
  args: {
    versions: HISTORY.versions.map((v) => ({
      ...v,
      metrics: { ...v.metrics, count: 0 },
      trend: HarnessVersionTrend.InsufficientData,
    })),
  },
};
