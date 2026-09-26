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
    onQuickWebApp: noop,
    onSpecDrivenProject: noop,
    onOpenLocalDirectory: noop,
    onImportGitHub: noop,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Full shell: the App Builder next to the stack-agnostic spec-driven path. */
export const Default: Story = {};

/** Apps-only shell: no spec-driven option. */
export const AppsOnlyShell: Story = {
  args: { onSpecDrivenProject: undefined },
};

/** Local folder import in progress. */
export const Importing: Story = {
  args: { importing: true },
};
