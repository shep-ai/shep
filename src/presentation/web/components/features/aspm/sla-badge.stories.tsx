import type { Meta, StoryObj } from '@storybook/react';
import { SlaBadge, SLA_BADGE_STATE } from './sla-badge';

const meta: Meta<typeof SlaBadge> = {
  title: 'Features/Aspm/SlaBadge',
  component: SlaBadge,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = { args: { state: SLA_BADGE_STATE.Healthy } };
export const AtRisk: Story = { args: { state: SLA_BADGE_STATE.AtRisk } };
export const Breached: Story = { args: { state: SLA_BADGE_STATE.Breached } };
export const Exception: Story = { args: { state: SLA_BADGE_STATE.Exception } };

export const Loading: Story = {
  // Pure presentational badge — "loading" maps to a low-emphasis placeholder.
  render: () => (
    <span
      className="bg-muted text-muted-foreground inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase opacity-60"
      data-testid="sla-badge-loading"
      aria-label="SLA: loading"
    >
      Loading…
    </span>
  ),
};

export const Error: Story = {
  render: () => (
    <span
      className="inline-flex items-center rounded-md border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-red-900 uppercase dark:border-red-900 dark:bg-red-950 dark:text-red-100"
      role="alert"
      data-testid="sla-badge-error"
    >
      SLA unavailable
    </span>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <SlaBadge state={SLA_BADGE_STATE.Healthy} />
      <SlaBadge state={SLA_BADGE_STATE.AtRisk} />
      <SlaBadge state={SLA_BADGE_STATE.Breached} />
      <SlaBadge state={SLA_BADGE_STATE.Exception} />
    </div>
  ),
};
