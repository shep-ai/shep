import type { Meta, StoryObj } from '@storybook/react';

import { FindingDetailPanel } from './finding-detail-panel';
import {
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  type RiskScoreBreakdown,
  type SecurityFinding,
} from '@shepai/core/domain/generated/output';

const meta: Meta<typeof FindingDetailPanel> = {
  title: 'Features/Aspm/FindingDetailPanel',
  component: FindingDetailPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

const now = new Date('2026-05-19T12:00:00Z');

function makeFinding(overrides: Partial<SecurityFinding>): SecurityFinding {
  return {
    id: 'f-1',
    applicationId: 'app-1',
    findingDomain: FindingDomain.Code,
    ruleId: 'javascript.express.security.sql-injection',
    title: 'SQL injection in /api/users handler',
    description:
      'User-controlled input flows directly into a SQL query string. ' +
      'Use parameterized queries or an ORM-supplied builder instead of string concatenation.',
    rawSeverity: 'HIGH',
    canonicalSeverity: CanonicalSeverity.High,
    state: FindingState.Open,
    source: 'sarif:semgrep',
    discoveredAt: now,
    lastSeenAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as SecurityFinding;
}

function makeBreakdown(overrides: Partial<RiskScoreBreakdown>): RiskScoreBreakdown {
  return {
    total: 0,
    cvssContribution: 0,
    epssContribution: 0,
    kevContribution: 0,
    exposureContribution: 0,
    criticalityContribution: 0,
    dataClassificationContribution: 0,
    ...overrides,
  };
}

export const Default: Story = {
  args: {
    finding: makeFinding({
      locationPath: 'src/api/users.ts',
      locationLine: 42,
      cveId: undefined,
      cweId: 'CWE-89',
      owaspAsvsControlId: 'V5.3.4',
    }),
    riskScoreBreakdown: makeBreakdown({
      total: 64,
      cvssContribution: 28,
      epssContribution: 0,
      kevContribution: 0,
      exposureContribution: 15,
      criticalityContribution: 10,
      dataClassificationContribution: 5,
    }),
  },
};

export const Loading: Story = { args: { loading: true } };

export const Error: Story = {
  args: { error: 'Failed to load finding f-1 (network error)' },
};

export const NotFound: Story = { args: { finding: null } };

export const EmptyBreakdownWithComputeButton: Story = {
  args: {
    finding: makeFinding({
      locationPath: 'src/api/users.ts',
      locationLine: 42,
    }),
    riskScoreBreakdown: null,
    onComputeRiskScore: async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    },
  },
};

export const CvssOnly: Story = {
  args: {
    finding: makeFinding({
      title: 'Insecure deserialization',
      canonicalSeverity: CanonicalSeverity.Medium,
      cveId: undefined,
      cweId: 'CWE-502',
    }),
    riskScoreBreakdown: makeBreakdown({
      total: 19,
      cvssContribution: 19,
    }),
  },
};

export const EpssBoosted: Story = {
  args: {
    finding: makeFinding({
      title: 'CVE-2024-1234 in openssl@3.0.2',
      ruleId: 'CVE-2024-1234',
      findingDomain: FindingDomain.Dependency,
      cveId: 'CVE-2024-1234',
      epssPercentile: 0.67,
      kev: false,
      source: 'sarif:trivy',
      locationPath: 'package-lock.json',
    }),
    riskScoreBreakdown: makeBreakdown({
      total: 48,
      cvssContribution: 28,
      epssContribution: 10,
      exposureContribution: 7.5,
      criticalityContribution: 2,
      dataClassificationContribution: 0,
    }),
  },
};

export const KevListedCritical: Story = {
  args: {
    finding: makeFinding({
      title: 'CVE-2024-9999 — actively exploited',
      ruleId: 'CVE-2024-9999',
      canonicalSeverity: CanonicalSeverity.Critical,
      findingDomain: FindingDomain.Dependency,
      cveId: 'CVE-2024-9999',
      kev: true,
      epssPercentile: 0.94,
      source: 'cyclonedx:1.5',
    }),
    riskScoreBreakdown: makeBreakdown({
      total: 98,
      cvssContribution: 35,
      epssContribution: 14,
      kevContribution: 20,
      exposureContribution: 15,
      criticalityContribution: 10,
      dataClassificationContribution: 4,
    }),
  },
};

export const NoCveSecretFinding: Story = {
  args: {
    finding: makeFinding({
      title: 'Hardcoded AWS key',
      ruleId: 'gitleaks.aws-key',
      findingDomain: FindingDomain.Secret,
      source: 'sarif:gitleaks',
      locationPath: 'src/legacy/config.ts',
      locationLine: 7,
    }),
    riskScoreBreakdown: makeBreakdown({
      total: 53,
      cvssContribution: 28,
      exposureContribution: 15,
      criticalityContribution: 8,
      dataClassificationContribution: 2,
    }),
  },
};
