import type { Meta, StoryObj } from '@storybook/react';

import { FindingsTable } from './findings-table';
import {
  CanonicalSeverity,
  FindingDomain,
  FindingState,
  type SecurityFinding,
} from '@shepai/core/domain/generated/output';

const meta: Meta<typeof FindingsTable> = {
  title: 'Features/Aspm/FindingsTable',
  component: FindingsTable,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

const now = new Date('2026-05-19T12:00:00Z');

function f(overrides: Partial<SecurityFinding>): SecurityFinding {
  return {
    id: 'f',
    applicationId: 'app',
    findingDomain: FindingDomain.Code,
    ruleId: 'rule.id',
    title: 'Sample finding',
    description: 'Description',
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

const SAMPLE: SecurityFinding[] = [
  f({
    id: 'f-1',
    title: 'SQL injection in /api/users',
    ruleId: 'javascript.express.security.sql-injection',
    canonicalSeverity: CanonicalSeverity.Critical,
    locationPath: 'src/api/users.ts',
    locationLine: 42,
  }),
  f({
    id: 'f-2',
    title: 'Reflected XSS in /search',
    ruleId: 'javascript.lang.security.audit.xss',
    locationPath: 'src/web/search.tsx',
    locationLine: 17,
  }),
  f({
    id: 'f-3',
    title: 'CVE-2024-1234 in openssl@3.0.2',
    ruleId: 'CVE-2024-1234',
    canonicalSeverity: CanonicalSeverity.Medium,
    findingDomain: FindingDomain.Dependency,
    cveId: 'CVE-2024-1234',
    state: FindingState.Triaged,
    source: 'sarif:trivy',
    locationPath: 'package-lock.json',
  }),
  f({
    id: 'f-4',
    title: 'Hardcoded API key in repo',
    ruleId: 'gitleaks.aws-key',
    canonicalSeverity: CanonicalSeverity.High,
    findingDomain: FindingDomain.Secret,
    source: 'sarif:gitleaks',
    locationPath: 'src/legacy/config.ts',
    locationLine: 7,
  }),
  f({
    id: 'f-5',
    title: 'Public S3 bucket',
    ruleId: 'checkov.CKV_AWS_53',
    canonicalSeverity: CanonicalSeverity.Low,
    findingDomain: FindingDomain.Cloud,
    state: FindingState.Resolved,
    source: 'sarif:checkov',
    locationPath: 'infra/terraform/main.tf',
    locationLine: 102,
  }),
  f({
    id: 'f-6',
    title: 'Outdated dependency',
    ruleId: 'cyclonedx:lodash',
    canonicalSeverity: CanonicalSeverity.Info,
    findingDomain: FindingDomain.Dependency,
    state: FindingState.Closed,
    source: 'cyclonedx:1.5',
  }),
];

export const Default: Story = { args: { findings: SAMPLE } };

export const Loading: Story = { args: { findings: [], loading: true } };

export const Empty: Story = { args: { findings: [] } };

export const Error: Story = {
  args: { findings: [], error: 'Failed to load findings (network error)' },
};

export const SingleCritical: Story = {
  args: {
    findings: [
      f({
        id: 'crit',
        title: 'Authentication bypass',
        canonicalSeverity: CanonicalSeverity.Critical,
        ruleId: 'codeql.auth.bypass',
        locationPath: 'src/auth/middleware.ts',
        locationLine: 11,
      }),
    ],
  },
};

export const InteractiveRows: Story = {
  args: {
    findings: SAMPLE.slice(0, 3),
    onRowClick: (finding: SecurityFinding) => window.alert(`Clicked ${finding.id}`),
  },
};
