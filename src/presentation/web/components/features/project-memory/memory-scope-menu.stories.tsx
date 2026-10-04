import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { MemoryScope } from '@shepai/core/domain/generated/output';
import { MemoryScopeMenu } from './memory-scope-menu';

const meta: Meta<typeof MemoryScopeMenu> = {
  title: 'Features/ProjectMemory/MemoryScopeMenu',
  component: MemoryScopeMenu,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  args: { onSelect: fn() },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const RepositoryOnly: Story = {
  args: { scope: MemoryScope.Project },
};

export const ProductLine: Story = {
  args: { scope: MemoryScope.ProductLine },
};

export const WholeSpace: Story = {
  args: { scope: MemoryScope.Space },
};

/** Entries written before spaces existed show as space-wide. */
export const LegacyOrganization: Story = {
  args: { scope: MemoryScope.Organization },
};
