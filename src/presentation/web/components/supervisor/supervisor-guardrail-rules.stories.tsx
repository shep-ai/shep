import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { SupervisorGuardrailRules } from './supervisor-guardrail-rules';
import { GuardrailGateType } from '@shepai/core/domain/generated/output';
import type { GuardrailRule } from '@shepai/core/domain/generated/output';

const meta: Meta<typeof SupervisorGuardrailRules> = {
  title: 'Supervisor/SupervisorGuardrailRules',
  component: SupervisorGuardrailRules,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SupervisorGuardrailRules>;

/** Inert handler for the static stories. */
const noop = (): void => undefined;

/**
 * The editor is controlled, so every story needs its own state — otherwise the
 * switches and inputs would look inert and misrepresent the component.
 */
function Interactive({ initial }: { initial: GuardrailRule[] }) {
  const [rules, setRules] = useState<GuardrailRule[]>(initial);
  return <SupervisorGuardrailRules rules={rules} onChange={setRules} />;
}

const LOW_RISK_MERGE: GuardrailRule = {
  id: 'rule-low-risk-merge',
  gate: GuardrailGateType.merge,
  maxDiffLines: 250,
  maxFilesChanged: 5,
  blockedPathPatterns: ['**/auth/**', '**/migrations/**'],
  requireCiPass: true,
  autoApprove: true,
};

const PLAN_ONLY: GuardrailRule = {
  id: 'rule-plan-advisory',
  gate: GuardrailGateType.plan,
  maxDiffLines: 100,
  autoApprove: false,
};

/** No rules configured — every gate reaches the evaluator model, as it does today. */
export const Default: Story = {
  render: () => <Interactive initial={[]} />,
};

export const SingleRule: Story = {
  render: () => <Interactive initial={[LOW_RISK_MERGE]} />,
};

export const MultipleRules: Story = {
  render: () => <Interactive initial={[LOW_RISK_MERGE, PLAN_ONLY]} />,
};

/** A rule with only a gate and the auto-approve toggle — the "approve everything here" case. */
export const MinimalRule: Story = {
  render: () => (
    <Interactive
      initial={[{ id: 'rule-merge-all', gate: GuardrailGateType.merge, autoApprove: true }]}
    />
  ),
};

export const Disabled: Story = {
  args: {
    rules: [LOW_RISK_MERGE],
    onChange: noop,
    disabled: true,
  },
};
