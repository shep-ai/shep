import type { Meta, StoryObj } from '@storybook/react';
import { SecurityMode } from '@shepai/core/domain/generated/output';
import { SecurityBadge } from './security-badge';

const meta: Meta<typeof SecurityBadge> = {
  title: 'Common/SecurityBadge',
  component: SecurityBadge,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SecurityBadge>;

/** Advisory mode — yellow shield indicating findings are logged but not blocked. */
export const Advisory: Story = {
  args: { mode: SecurityMode.Advisory },
};

/** Enforce mode — red shield indicating violations are actively blocked. */
export const Enforce: Story = {
  args: { mode: SecurityMode.Enforce },
};

/** Disabled mode — gray shield indicating security is turned off. */
export const Disabled: Story = {
  args: { mode: SecurityMode.Disabled },
};
