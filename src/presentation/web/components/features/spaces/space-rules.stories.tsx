import type { Meta, StoryObj } from '@storybook/react';
import { SpaceRules } from './space-rules';
import { ACME, ACME_RULES, PAYMENTS, PLATFORM, runInStory } from './spaces-fixtures';

const meta: Meta<typeof SpaceRules> = {
  title: 'Features/Spaces/SpaceRules',
  component: SpaceRules,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: { space: ACME, run: runInStory },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRules: Story = {
  args: { rules: ACME_RULES, productLines: [PAYMENTS, PLATFORM] },
};

/** Without product lines the line picker is hidden. */
export const NoProductLines: Story = {
  args: { rules: ACME_RULES.slice(0, 1), productLines: [] },
};

export const Empty: Story = {
  args: { rules: [], productLines: [] },
};
