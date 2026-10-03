import type { Meta, StoryObj } from '@storybook/react';
import { fixtureCapabilities, fixturePolicies } from './harness-fixtures';
import { HarnessCatalogLists } from './harness-catalog-lists';

const meta: Meta<typeof HarnessCatalogLists> = {
  title: 'Harness/HarnessCatalogLists',
  component: HarnessCatalogLists,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof HarnessCatalogLists>;

/** The tiered tool catalog next to the effective permission rules. */
export const Default: Story = {
  args: { capabilities: fixtureCapabilities, policies: fixturePolicies },
};

/** A repository policy file that failed to parse. */
export const PolicyIssue: Story = {
  args: {
    capabilities: fixtureCapabilities,
    policies: {
      ...fixturePolicies,
      issues: [
        {
          file: '.shep/harness/policies/team.yaml',
          message: 'rules[0].effect must be allow, ask or deny',
        },
      ],
    },
  },
};
