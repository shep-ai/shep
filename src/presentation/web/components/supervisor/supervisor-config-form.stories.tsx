import type { Meta, StoryObj } from '@storybook/react';
import { SupervisorConfigForm } from './supervisor-config-form';
import {
  GuardrailGateType,
  SupervisorAutonomy,
  SupervisorScopeType,
} from '@shepai/core/domain/generated/output';
import type { SupervisorPolicy } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof SupervisorConfigForm> = {
  title: 'Supervisor/SupervisorConfigForm',
  component: SupervisorConfigForm,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SupervisorConfigForm>;

const samplePolicy: SupervisorPolicy = {
  id: 'pol-123',
  scopeType: SupervisorScopeType.app,
  scopeId: 'app-1',
  enabled: true,
  autonomyLevel: SupervisorAutonomy.advisory,
  modelId: 'claude-sonnet-4',
  promptVersion: 'v1',
  gateAuthorityJson: JSON.stringify({ merge: SupervisorAutonomy.cosign }),
  policyRulesJson: undefined,
  notificationOverridesJson: undefined,
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-15T00:00:00Z',
};

export const Default: Story = {
  args: {
    scopeType: 'app',
    scopeId: 'app-1',
    initialPolicy: null,
    onSubmitOverride: async () => ({ ok: true }),
  },
};

export const ExistingPolicy: Story = {
  args: {
    scopeType: 'app',
    scopeId: 'app-1',
    initialPolicy: samplePolicy,
    onSubmitOverride: async () => ({ ok: true }),
  },
};

export const FeatureOverride: Story = {
  args: {
    scopeType: 'app',
    scopeId: 'app-1',
    featureId: 'feat-7',
    initialPolicy: null,
    onSubmitOverride: async () => ({ ok: true }),
  },
};

export const Loading: Story = {
  args: {
    scopeType: 'app',
    scopeId: 'app-1',
    initialPolicy: null,
    forceState: 'loading',
    onSubmitOverride: async () => ({ ok: true }),
  },
};

export const Error: Story = {
  args: {
    scopeType: 'app',
    scopeId: 'app-1',
    initialPolicy: null,
    forceState: 'error',
    onSubmitOverride: async () => ({ ok: false, error: 'Validation failed' }),
  },
};

/**
 * The guardrail editor (spec 111) with a realistic rule set: a low-risk merge
 * gate that may auto-approve, and a plan-gate rule that only advises.
 *
 * This is the surface that decides whether a gate is closed without a model
 * call, so it is worth seeing next to the autonomy ladder it sits in front of.
 */
export const WithGuardrailRules: Story = {
  args: {
    scopeType: 'app',
    scopeId: 'app-1',
    initialPolicy: {
      ...samplePolicy,
      autonomyLevel: SupervisorAutonomy.autonomous,
      gateAuthorityJson: JSON.stringify({ merge: SupervisorAutonomy.autonomous }),
      guardrailRulesJson: JSON.stringify([
        {
          id: 'rule-low-risk-merge',
          gate: GuardrailGateType.merge,
          maxDiffLines: 250,
          maxFilesChanged: 5,
          blockedPathPatterns: ['**/auth/**', '**/migrations/**', 'package.json'],
          requireCiPass: true,
          autoApprove: true,
        },
        {
          id: 'rule-plan-advisory',
          gate: GuardrailGateType.plan,
          maxDiffLines: 100,
          autoApprove: false,
        },
      ]),
    },
    onSubmitOverride: async () => ({ ok: true }),
  },
};
