import type { Meta, StoryObj } from '@storybook/react';
import { BuildMode } from '@shepai/core/domain/generated/output';
import { ControlCenterEmptyState } from './control-center-empty-state';

const meta: Meta<typeof ControlCenterEmptyState> = {
  title: 'Features/ControlCenterEmptyState',
  component: ControlCenterEmptyState,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ height: '100vh' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Apps-only surface (no canvas): Quick prototype only, with its stack stated. */
export const Default: Story = {
  args: {},
};

/** With callback — for interaction testing */
export const WithCallback: Story = {
  args: {
    onRepositorySelect: (path: string) => {
      // eslint-disable-next-line no-console
      console.log('Selected repository:', path);
    },
    onApplicationCreated: (appId: string) => {
      // eslint-disable-next-line no-console
      console.log('Application created:', appId);
    },
  },
};

/** As overlay — with close button */
export const AsOverlay: Story = {
  args: {
    onClose: () => {
      // eslint-disable-next-line no-console
      console.log('Close clicked');
    },
    className: 'bg-background',
  },
};

/** Canvas surface: Spec-driven (any stack) is selected by default. */
export const SpecDrivenDefault: Story = {
  args: {
    onRepositorySelect: () => undefined,
    onOpenExistingFolder: () => undefined,
  },
};

/** Canvas surface opened straight into the Quick prototype mode. */
export const QuickWebAppMode: Story = {
  args: {
    onRepositorySelect: () => undefined,
    initialMode: BuildMode.Application,
  },
};
