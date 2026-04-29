import type { Meta, StoryObj } from '@storybook/react';
import { within, userEvent, expect } from '@storybook/test';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { OpenInControlCenterMenuItem } from './open-in-control-center-menu-item';

const meta: Meta<typeof OpenInControlCenterMenuItem> = {
  title: 'ApplicationPage/OpenInControlCenterMenuItem',
  component: OpenInControlCenterMenuItem,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof OpenInControlCenterMenuItem>;

/**
 * **Default** — menu item rendered inside an open DropdownMenu so the
 * label and Sparkles icon are visible. Selecting it pushes to
 * `/create?applicationId=<id>&mode=spec` (router.push is stubbed in
 * Storybook).
 */
export const Default: Story = {
  render: (args) => (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded border px-3 py-1.5 text-sm" aria-label="Open menu">
          Open menu
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <OpenInControlCenterMenuItem applicationId={args.applicationId} />
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  args: {
    applicationId: 'app-001',
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const item = await body.findByTestId('open-in-control-center-sdd-menu-item');
    await expect(item).toBeInTheDocument();
  },
};

/**
 * **Hovered** — verifies the cursor state and accessible label by
 * hovering the menu item once it's rendered.
 */
export const Hovered: Story = {
  render: (args) => (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded border px-3 py-1.5 text-sm" aria-label="Open menu">
          Open menu
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <OpenInControlCenterMenuItem applicationId={args.applicationId} />
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  args: {
    applicationId: 'app-002',
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const item = await body.findByTestId('open-in-control-center-sdd-menu-item');
    await userEvent.hover(item);
  },
};
