import type { Meta, StoryObj } from '@storybook/react';
import { ShellVariantProvider } from '@/hooks/shell-variant-context';
import { AddFeatureButton } from './add-feature-button';

const meta: Meta<typeof AddFeatureButton> = {
  title: 'Features/ApplicationPage/AddFeatureButton',
  component: AddFeatureButton,
  tags: ['autodocs'],
  args: { applicationId: 'app-42' },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Full shell: opens a spec-driven feature scoped to the app. */
export const Default: Story = {};

/** Apps-only shell: renders nothing, because Control Center is unavailable. */
export const AppsOnlyShell: Story = {
  decorators: [
    (Story) => (
      <ShellVariantProvider variant="apps-only">
        <Story />
      </ShellVariantProvider>
    ),
  ],
};
