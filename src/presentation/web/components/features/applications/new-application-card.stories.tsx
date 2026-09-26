import type { Meta, StoryObj } from '@storybook/react';
import { NewApplicationCard } from './new-application-card';

const noop = () => undefined;

const meta: Meta<typeof NewApplicationCard> = {
  title: 'Features/Applications/NewApplicationCard',
  component: NewApplicationCard,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 360, padding: 24 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    onPlanFirst: noop,
    onQuickPrototype: noop,
    onOpenLocalDirectory: noop,
    onImportGitHub: noop,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Full shell: Plan it first (any stack) next to the prototype template. */
export const Default: Story = {};

/** Apps-only shell: only the prototype template, no "Plan it first". */
export const AppsOnlyShell: Story = {
  args: { onPlanFirst: undefined },
};

/** Local folder import in progress. */
export const Importing: Story = {
  args: { importing: true },
};
