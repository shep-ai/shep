import type { Meta, StoryObj } from '@storybook/react';
import {
  IncidentSeverity,
  IncidentStatus,
  RuntimeActionStatus,
} from '@shepai/core/domain/generated/output';
import { ActionStatusBadge, IncidentStatusBadge, SeverityBadge } from './incident-badges';

function AllBadges() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        {Object.values(IncidentSeverity).map((severity) => (
          <SeverityBadge key={severity} severity={severity} />
        ))}
      </div>
      <div className="flex gap-1">
        {Object.values(IncidentStatus).map((status) => (
          <IncidentStatusBadge key={status} status={status} />
        ))}
      </div>
      <div className="flex gap-1">
        {Object.values(RuntimeActionStatus).map((status) => (
          <ActionStatusBadge key={status} status={status} />
        ))}
      </div>
    </div>
  );
}

const meta: Meta<typeof AllBadges> = {
  title: 'Features/Incidents/IncidentBadges',
  component: AllBadges,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
