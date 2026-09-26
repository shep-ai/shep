import type { Meta, StoryObj } from '@storybook/react';
import { ExistingCodeHint } from './existing-code-hint';

const meta: Meta<typeof ExistingCodeHint> = {
  title: 'Features/ControlCenter/ExistingCodeHint',
  component: ExistingCodeHint,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 672, padding: 24 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** The prompt names an absolute folder — offer to work on it instead. */
export const WithHandOff: Story = {
  args: {
    path: '/home/alex/code/tgarmeniantrainer',
    onOpen: () => undefined,
  },
};

/** No hand-off available (home-relative path or apps-only shell). */
export const GuidanceOnly: Story = {
  args: {
    path: '~/work/api',
  },
};

/** A long Windows path wraps instead of overflowing. */
export const LongWindowsPath: Story = {
  args: {
    path: 'C:\\Users\\developer\\source\\repos\\a-very-long-project-name\\services\\billing-api',
    onOpen: () => undefined,
  },
};
