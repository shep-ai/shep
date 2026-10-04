/** Sample investigations for stories and tests of the Investigation panel. */

import {
  AgentType,
  HypothesisConfidence,
  InvestigationStatus,
  type WorkItemInvestigation,
} from '@shepai/core/domain/generated/output';
import type { RepositoryOption } from './investigation-panel';

const T = new Date('2026-10-04T10:00:00Z');

export const SAMPLE_REPOSITORIES: RepositoryOption[] = [
  { path: '/Users/me/src/pay', name: 'pay' },
  { path: '/Users/me/src/web', name: 'web' },
];

export const PENDING_INVESTIGATION: WorkItemInvestigation = {
  id: 'inv-1',
  workItemId: 'item-1',
  repositoryPath: '/Users/me/src/pay',
  status: InvestigationStatus.Running,
  hypotheses: [],
  agentType: AgentType.ClaudeCode,
  startedAt: T,
  createdAt: T,
  updatedAt: T,
};

export const COMPLETED_INVESTIGATION: WorkItemInvestigation = {
  ...PENDING_INVESTIGATION,
  status: InvestigationStatus.Completed,
  commitSha: 'c0ffee1234567',
  finishedAt: T,
  summary:
    'Refunds look the customer up from the order, but orders placed at guest checkout have no customer.',
  hypotheses: [
    {
      number: 1,
      title: 'Guest orders have no customer id',
      rootCause:
        'refundOrder() reads order.customer.id to find the payment method; guest orders store the email only, so it throws.',
      confidence: HypothesisConfidence.High,
      evidence: [
        { file: 'src/refunds/refund-order.ts', line: 42, note: 'reads order.customer.id' },
        { file: 'src/orders/order.ts', line: 17, note: 'customer is optional for guest checkout' },
      ],
      testPlan: 'In tests/refunds/refund-order.test.ts, refund a guest order and expect success.',
      fixPlan: 'Resolve the payment method from the order when there is no customer.',
    },
    {
      number: 2,
      title: 'Stale payment method cache',
      rootCause: 'The cache key ignores the order, so a guest refund may reuse another payment.',
      confidence: HypothesisConfidence.Low,
      evidence: [{ file: 'src/payments/cache.ts', note: 'key is the customer id only' }],
      testPlan: 'Refund two guest orders in a row and expect each to use its own payment.',
      fixPlan: 'Key the cache by order id.',
    },
  ],
};

export const FAILED_INVESTIGATION: WorkItemInvestigation = {
  ...PENDING_INVESTIGATION,
  status: InvestigationStatus.Failed,
  finishedAt: T,
  error: 'Agent call timed out after 20 minutes.',
};

export const APPROVED_INVESTIGATION: WorkItemInvestigation = {
  ...COMPLETED_INVESTIGATION,
  approvedHypothesisNumber: 1,
  featureId: 'feature-1',
};
