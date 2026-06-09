import type { Meta, StoryObj } from '@storybook/react';
import {
  SecurityMode,
  SecuritySeverity,
  SecurityActionCategory,
  SecurityActionDisposition,
} from '@shepai/core/domain/generated/output';
import { SupplyChainSecuritySettingsSection } from './supply-chain-security-settings-section';
import type { SecurityState } from '@shepai/core/application/use-cases/security/get-security-state.use-case';

const meta: Meta<typeof SupplyChainSecuritySettingsSection> = {
  title: 'Settings/SupplyChainSecuritySettingsSection',
  component: SupplyChainSecuritySettingsSection,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof SupplyChainSecuritySettingsSection>;

const baseState: SecurityState = {
  mode: SecurityMode.Advisory,
  lastEvaluationAt: null,
  policySource: null,
  recentEvents: [],
  highestSeverityFinding: null,
};

/** Advisory mode with no findings — default posture for new repositories. */
export const AdvisoryNoFindings: Story = {
  args: {
    securityState: baseState,
  },
};

/** Disabled mode — security enforcement is turned off. */
export const Disabled: Story = {
  args: {
    securityState: {
      ...baseState,
      mode: SecurityMode.Disabled,
    },
  },
};

/** Enforce mode with a critical finding. */
export const EnforceWithCriticalFinding: Story = {
  args: {
    securityState: {
      mode: SecurityMode.Enforce,
      lastEvaluationAt: new Date().toISOString(),
      policySource: 'shep.security.yaml',
      recentEvents: [
        {
          id: 'evt-1',
          repositoryPath: '/path/to/repo',
          severity: SecuritySeverity.Critical,
          category: SecurityActionCategory.PublishRelease,
          disposition: SecurityActionDisposition.Denied,
          message: 'Missing npm provenance configuration in release workflow',
          remediationSummary: 'Add --provenance flag to npm publish step',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      highestSeverityFinding: {
        id: 'evt-1',
        repositoryPath: '/path/to/repo',
        severity: SecuritySeverity.Critical,
        category: SecurityActionCategory.PublishRelease,
        disposition: SecurityActionDisposition.Denied,
        message: 'Missing npm provenance configuration in release workflow',
        remediationSummary: 'Add --provenance flag to npm publish step',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
  },
};

/** Advisory mode with multiple findings of varying severity. */
export const AdvisoryWithMultipleFindings: Story = {
  args: {
    securityState: {
      mode: SecurityMode.Advisory,
      lastEvaluationAt: new Date(Date.now() - 3600000).toISOString(),
      policySource: 'shep.security.yaml',
      recentEvents: [
        {
          id: 'evt-1',
          repositoryPath: '/path/to/repo',
          severity: SecuritySeverity.High,
          category: SecurityActionCategory.DependencyInstall,
          disposition: SecurityActionDisposition.Denied,
          message: 'Package has postinstall lifecycle script: malicious-pkg@1.0.0',
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'evt-3',
          repositoryPath: '/path/to/repo',
          severity: SecuritySeverity.Low,
          category: SecurityActionCategory.DependencyInstall,
          disposition: SecurityActionDisposition.Allowed,
          message: 'Dependency uses git source instead of registry: lodash@git+https://...',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      highestSeverityFinding: {
        id: 'evt-1',
        repositoryPath: '/path/to/repo',
        severity: SecuritySeverity.High,
        category: SecurityActionCategory.DependencyInstall,
        disposition: SecurityActionDisposition.Denied,
        message: 'Package has postinstall lifecycle script: malicious-pkg@1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    },
  },
};
