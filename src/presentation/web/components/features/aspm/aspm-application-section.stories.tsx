import type { Meta, StoryObj } from '@storybook/react';

import {
  AspmApplicationSection,
  type AspmApplicationSectionView,
} from './aspm-application-section';
import {
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  type SecurityFinding,
} from '@shepai/core/domain/generated/output';

const meta: Meta<typeof AspmApplicationSection> = {
  title: 'Features/Aspm/AspmApplicationSection',
  component: AspmApplicationSection,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

const now = new Date('2026-05-19T00:00:00Z');

function finding(id: string, severity: CanonicalSeverity, title: string): SecurityFinding {
  return {
    id,
    applicationId: 'app-1',
    findingDomain: FindingDomain.Code,
    ruleId: `rule.${id}`,
    title,
    description: '',
    rawSeverity: severity.toUpperCase(),
    canonicalSeverity: severity,
    state: FindingState.Open,
    source: 'sarif:semgrep',
    discoveredAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
  } as SecurityFinding;
}

const populated: AspmApplicationSectionView = {
  openBySeverity: [
    { severity: CanonicalSeverity.Critical, count: 1 },
    { severity: CanonicalSeverity.High, count: 3 },
    { severity: CanonicalSeverity.Medium, count: 7 },
    { severity: CanonicalSeverity.Low, count: 2 },
    { severity: CanonicalSeverity.Info, count: 0 },
  ],
  topFindings: [
    finding('a', CanonicalSeverity.Critical, 'SQL injection in handler'),
    finding('b', CanonicalSeverity.High, 'XSS in template'),
    finding('c', CanonicalSeverity.High, 'Vulnerable dependency lodash@4.17.10'),
  ],
  topRiskScoreTotal: 84,
  ownerCount: 2,
};

export const Default: Story = {
  args: { applicationId: 'app-1', posture: populated, exceptionCount: 1 },
};

export const Loading: Story = { args: { applicationId: 'app-1', posture: null, loading: true } };

export const Error: Story = {
  args: { applicationId: 'app-1', posture: null, error: 'Couldn’t load posture' },
};

export const Empty: Story = { args: { applicationId: 'app-1', posture: null } };
