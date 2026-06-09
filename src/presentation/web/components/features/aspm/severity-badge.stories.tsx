import type { Meta, StoryObj } from '@storybook/react';
import { SeverityBadge } from './severity-badge';
import { CanonicalSeverity } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof SeverityBadge> = {
  title: 'Features/Aspm/SeverityBadge',
  component: SeverityBadge,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Critical: Story = { args: { severity: CanonicalSeverity.Critical } };
export const High: Story = { args: { severity: CanonicalSeverity.High } };
export const Medium: Story = { args: { severity: CanonicalSeverity.Medium } };
export const Low: Story = { args: { severity: CanonicalSeverity.Low } };
export const Info: Story = { args: { severity: CanonicalSeverity.Info } };

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <SeverityBadge severity={CanonicalSeverity.Critical} />
      <SeverityBadge severity={CanonicalSeverity.High} />
      <SeverityBadge severity={CanonicalSeverity.Medium} />
      <SeverityBadge severity={CanonicalSeverity.Low} />
      <SeverityBadge severity={CanonicalSeverity.Info} />
    </div>
  ),
};
