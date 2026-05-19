import type { Meta, StoryObj } from '@storybook/react';

import { ComplianceCoverageView, type FrameworkCoverageView } from './compliance-coverage-view';
import { ComplianceFramework } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof ComplianceCoverageView> = {
  title: 'Features/Aspm/ComplianceCoverageView',
  component: ComplianceCoverageView,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

const asvsFramework: FrameworkCoverageView = {
  frameworkId: ComplianceFramework.OwaspAsvs,
  totalControls: 4,
  controlsWithOpenFindings: 2,
  controlsWithoutEvidence: 2,
  totalOpenFindingLinks: 7,
  controls: [
    {
      controlId: 'cc-asvs-v2-1-1',
      controlIdentifier: 'V2.1.1',
      title: 'Passwords are at least 12 characters',
      openFindingCount: 0,
    },
    {
      controlId: 'cc-asvs-v5-1-3',
      controlIdentifier: 'V5.1.3',
      title: 'Input validation enforced on trusted service layer',
      openFindingCount: 3,
    },
    {
      controlId: 'cc-asvs-v5-3-4',
      controlIdentifier: 'V5.3.4',
      title: 'Parameterized queries used for data access',
      openFindingCount: 4,
    },
    {
      controlId: 'cc-asvs-v9-1-1',
      controlIdentifier: 'V9.1.1',
      title: 'TLS used for all client connectivity',
      openFindingCount: 0,
    },
  ],
};

const cweFramework: FrameworkCoverageView = {
  frameworkId: ComplianceFramework.CweTop25,
  totalControls: 4,
  controlsWithOpenFindings: 3,
  controlsWithoutEvidence: 1,
  totalOpenFindingLinks: 9,
  controls: [
    {
      controlId: 'cc-cwe-22',
      controlIdentifier: 'CWE-22',
      title: "Improper Limitation of a Pathname to a Restricted Directory ('Path Traversal')",
      openFindingCount: 0,
    },
    {
      controlId: 'cc-cwe-79',
      controlIdentifier: 'CWE-79',
      title: 'Cross-site Scripting',
      openFindingCount: 5,
    },
    {
      controlId: 'cc-cwe-89',
      controlIdentifier: 'CWE-89',
      title: 'SQL Injection',
      openFindingCount: 3,
    },
    {
      controlId: 'cc-cwe-352',
      controlIdentifier: 'CWE-352',
      title: 'Cross-Site Request Forgery (CSRF)',
      openFindingCount: 1,
    },
  ],
};

export const Default: Story = {
  args: {
    frameworks: [asvsFramework, cweFramework],
  },
};

export const Loading: Story = { args: { loading: true } };

export const Error: Story = {
  args: { error: 'Failed to load compliance coverage' },
};

export const Empty: Story = { args: { frameworks: [] } };

export const SingleFramework: Story = {
  args: {
    frameworks: [cweFramework],
  },
};

export const NoOpenFindings: Story = {
  args: {
    frameworks: [
      {
        ...asvsFramework,
        controlsWithOpenFindings: 0,
        controlsWithoutEvidence: 4,
        totalOpenFindingLinks: 0,
        controls: asvsFramework.controls.map((c) => ({ ...c, openFindingCount: 0 })),
      },
    ],
  },
};

export const FrameworkWithNoControls: Story = {
  args: {
    frameworks: [
      {
        frameworkId: ComplianceFramework.OwaspAsvs,
        totalControls: 0,
        controlsWithOpenFindings: 0,
        controlsWithoutEvidence: 0,
        totalOpenFindingLinks: 0,
        controls: [],
      },
    ],
  },
};
