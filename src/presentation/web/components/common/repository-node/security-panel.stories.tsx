import type { Meta, StoryObj } from '@storybook/react';
import {
  SecuritySeverity,
  SecurityActionCategory,
  SecurityActionDisposition,
} from '@shepai/core/domain/generated/output';
import { SecurityPanel } from './security-panel';

const meta: Meta<typeof SecurityPanel> = {
  title: 'Common/SecurityPanel',
  component: SecurityPanel,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SecurityPanel>;

/** No findings — clean repository. */
export const NoFindings: Story = {
  args: {
    events: [],
  },
};

/** Mixed governance and dependency findings. */
export const MixedFindings: Story = {
  args: {
    events: [
      {
        id: 'evt-1',
        repositoryPath: '/path/to/repo',
        severity: SecuritySeverity.High,
        category: SecurityActionCategory.DependencyInstall,
        disposition: SecurityActionDisposition.Denied,
        message: 'Package has postinstall lifecycle script: suspicious-pkg@2.0.0',
        remediationSummary: 'Review and approve the lifecycle script or add to denylist',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'evt-2',
        repositoryPath: '/path/to/repo',
        severity: SecuritySeverity.Medium,
        category: SecurityActionCategory.CiWorkflowModify,
        disposition: SecurityActionDisposition.Allowed,
        message: '[Governance Audit] Branch protection not enabled on main',
        remediationSummary: 'Enable branch protection rules for the main branch',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'evt-3',
        repositoryPath: '/path/to/repo',
        severity: SecuritySeverity.Low,
        category: SecurityActionCategory.DependencyInstall,
        disposition: SecurityActionDisposition.Allowed,
        message: 'Dependency uses git source: lodash@git+https://github.com/lodash/lodash.git',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  },
};
