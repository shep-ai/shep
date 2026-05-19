import type { Meta, StoryObj } from '@storybook/react';

import { FindingsPageClient } from './findings-page-client';
import {
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  type SecurityFinding,
} from '@shepai/core/domain/generated/output';

const meta: Meta<typeof FindingsPageClient> = {
  title: 'Features/Aspm/FindingsPageClient',
  component: FindingsPageClient,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

const seededFindings: SecurityFinding[] = [
  {
    id: 'find-1',
    applicationId: 'app-1',
    findingDomain: FindingDomain.Code,
    ruleId: 'semgrep.tainted-sql',
    title: 'Possible SQL injection via concatenated query',
    description: 'Stack trace shows user input flowing into raw query',
    locationPath: 'src/users.ts',
    locationLine: 42,
    rawSeverity: 'high',
    canonicalSeverity: CanonicalSeverity.High,
    state: FindingState.Open,
    source: 'semgrep',
    discoveredAt: '2026-05-15T10:00:00.000Z',
    lastSeenAt: '2026-05-19T09:00:00.000Z',
    createdAt: '2026-05-15T10:00:00.000Z',
    updatedAt: '2026-05-19T09:00:00.000Z',
  } as SecurityFinding,
  {
    id: 'find-2',
    applicationId: 'app-1',
    findingDomain: FindingDomain.Secret,
    ruleId: 'gitleaks.aws-key',
    title: 'AWS access key checked into repository',
    description: 'AWS access key prefix detected in config/secrets.ts',
    locationPath: 'config/secrets.ts',
    locationLine: 8,
    rawSeverity: 'critical',
    canonicalSeverity: CanonicalSeverity.Critical,
    state: FindingState.Triaged,
    source: 'gitleaks',
    discoveredAt: '2026-05-12T10:00:00.000Z',
    lastSeenAt: '2026-05-19T09:00:00.000Z',
    createdAt: '2026-05-12T10:00:00.000Z',
    updatedAt: '2026-05-19T09:00:00.000Z',
  } as SecurityFinding,
];

export const Default: Story = {
  args: {
    initialFilter: {},
    findings: seededFindings,
    total: seededFindings.length,
    error: null,
  },
};

export const Loading: Story = {
  render: () => (
    <div className="pointer-events-none opacity-50" aria-busy="true">
      <FindingsPageClient initialFilter={{}} findings={[]} total={0} error={null} />
    </div>
  ),
};

export const Error: Story = {
  args: {
    initialFilter: {},
    findings: [],
    total: 0,
    error: 'Failed to load findings',
  },
};

export const Empty: Story = {
  args: {
    initialFilter: {},
    findings: [],
    total: 0,
    error: null,
  },
};
