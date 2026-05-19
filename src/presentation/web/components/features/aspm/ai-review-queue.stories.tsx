import type { Meta, StoryObj } from '@storybook/react';

import { AiReviewQueue } from './ai-review-queue';
import {
  AiSignalState,
  AiSignalType,
  CanonicalSeverity,
  type AiChangeRiskSignal,
} from '@shepai/core/domain/generated/output';

const meta: Meta<typeof AiReviewQueue> = {
  title: 'Features/Aspm/AiReviewQueue',
  component: AiReviewQueue,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof meta>;

const now = new Date('2026-05-19T12:00:00Z');

function s(overrides: Partial<AiChangeRiskSignal>): AiChangeRiskSignal {
  return {
    id: 's',
    applicationId: 'app',
    signalType: AiSignalType.SecretInDiff,
    severity: CanonicalSeverity.High,
    summary: 'Sample AI signal',
    state: AiSignalState.Open,
    discoveredAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as AiChangeRiskSignal;
}

const SAMPLE: AiChangeRiskSignal[] = [
  s({
    id: 's-1',
    summary: 'AI-generated code added an AWS access key',
    signalType: AiSignalType.SecretInDiff,
    severity: CanonicalSeverity.Critical,
    agentSessionId: 'sess-a1b2c3',
  }),
  s({
    id: 's-2',
    summary: 'New dependency: lodash@3.10.1 (CVE-laden)',
    signalType: AiSignalType.HighRiskDependencyAdded,
    severity: CanonicalSeverity.High,
    state: AiSignalState.Acknowledged,
    agentSessionId: 'sess-d4e5f6',
  }),
  s({
    id: 's-3',
    summary: 'Diff is 4,200 lines and was not reviewed',
    signalType: AiSignalType.LargeUnreviewedDiff,
    severity: CanonicalSeverity.Medium,
  }),
  s({
    id: 's-4',
    summary: 'Prompt-injection shape in user-input handler',
    signalType: AiSignalType.PromptInjectionShape,
    severity: CanonicalSeverity.High,
  }),
];

const stubActions = {
  graduateSignal: async () => ({ findingId: 'f-graduated-1' }),
  dismissSignal: async () => undefined,
};

export const Default: Story = { args: { signals: SAMPLE, actions: stubActions } };

export const Loading: Story = { args: { signals: [], loading: true } };

export const Empty: Story = { args: { signals: [] } };

export const Error: Story = {
  args: { signals: [], error: 'Failed to load AI review queue' },
};

export const OnlyCritical: Story = {
  args: {
    signals: [
      s({
        id: 'crit',
        summary: 'AWS secret in AI-generated config',
        severity: CanonicalSeverity.Critical,
      }),
    ],
    actions: stubActions,
  },
};

export const Graduated: Story = {
  args: {
    signals: [
      s({
        id: 'grad-1',
        summary: 'Already graduated to a finding',
        state: AiSignalState.GraduatedToFinding,
        graduatedFindingId: 'f-grad-xyz',
      }),
    ],
    actions: stubActions,
  },
};

export const Dismissed: Story = {
  args: {
    signals: [
      s({
        id: 'dis-1',
        summary: 'False positive — test fixture key',
        state: AiSignalState.Dismissed,
      }),
    ],
    actions: stubActions,
  },
};

export const FailingGraduate: Story = {
  args: {
    signals: [s({ id: 's-err', summary: 'Will fail to graduate' })],
    actions: {
      ...stubActions,
      graduateSignal: async () => {
        throw new globalThis.Error('Repository unavailable');
      },
    },
  },
};
