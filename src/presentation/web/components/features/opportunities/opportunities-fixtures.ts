/** Sample board data for the Opportunities stories (spec 126). */

import {
  OpportunityStatus,
  SignalKind,
  type Opportunity,
  type Signal,
} from '@shepai/core/domain/generated/output';
import type { OpportunityBoard } from '@shepai/core/application/use-cases/opportunities/get-opportunity-board.use-case';
import type { ScoredOpportunity } from '@shepai/core/domain/shared/opportunity-score';
import type { RunAction } from '@/hooks/use-run-action';
import type { OpportunityPageOptions } from './opportunities-types';
import type { FeedbackTheme } from '@shepai/core/domain/shared/feedback-themes';
import type { FeedbackKeyView } from '@shepai/core/application/use-cases/feedback/manage-feedback-keys.use-case';

const T = new Date('2026-10-05T10:00:00Z');

function bet(id: string, title: string, extra: Partial<Opportunity>): Opportunity {
  return {
    id,
    spaceId: 'space-acme',
    title,
    status: OpportunityStatus.Accepted,
    reviewHours: 4,
    confidence: 0.7,
    strategic: false,
    createdAt: T,
    updatedAt: T,
    ...extra,
  };
}

export const BUILDING: ScoredOpportunity = {
  opportunity: bet('opp-sso', 'SSO for enterprise', {
    status: OpportunityStatus.Building,
    reviewHours: 8,
    strategic: true,
    workItemId: 'wi-1',
  }),
  evidence: { signals: 4, customers: 3, revenueAtStake: 12000, urgentSignals: 1 },
  value: 35,
  score: 3.06,
};

export const CHECKOUT: ScoredOpportunity = {
  opportunity: bet('opp-checkout', 'Faster guest checkout', { reviewHours: 6 }),
  evidence: { signals: 5, customers: 4, revenueAtStake: 6500, urgentSignals: 2 },
  value: 23,
  score: 2.68,
};

export const EXPORT: ScoredOpportunity = {
  opportunity: bet('opp-export', 'CSV export', { reviewHours: 10, confidence: 0.5 }),
  evidence: { signals: 2, customers: 2, revenueAtStake: 1500, urgentSignals: 0 },
  value: 5,
  score: 0.25,
};

export const IDEA: ScoredOpportunity = {
  opportunity: bet('opp-dark', 'Dark mode', {
    status: OpportunityStatus.Proposed,
    reviewHours: 2,
    confidence: 0.4,
  }),
  evidence: { signals: 1, customers: 1, revenueAtStake: 0, urgentSignals: 0 },
  value: 1,
  score: 0.2,
};

export const LOOSE_SIGNALS: Signal[] = [
  {
    id: 'sig-timeout',
    spaceId: 'space-acme',
    kind: SignalKind.Incident,
    title: 'Checkout p95 above 4s since Tuesday',
    urgent: true,
    url: 'https://grafana.acme.com/d/checkout',
    createdAt: T,
    updatedAt: T,
  },
  {
    id: 'sig-invoice',
    spaceId: 'space-acme',
    kind: SignalKind.Feedback,
    title: 'Invoices should show the PO number',
    customer: 'Globex',
    monthlyRevenue: 4000,
    urgent: false,
    createdAt: T,
    updatedAt: T,
  },
];

export const BOARD: OpportunityBoard = {
  space: { id: 'space-acme', name: 'Acme', slug: 'acme' },
  weights: {
    spaceId: 'space-acme',
    reach: 1,
    revenue: 2,
    urgency: 3,
    strategic: 5,
    weeklyReviewHours: 16,
  },
  ranked: [BUILDING, CHECKOUT, EXPORT, IDEA],
  line: { inLine: [BUILDING, CHECKOUT], waiting: [EXPORT], usedHours: 14, capacityHours: 16 },
  unlinkedSignals: LOOSE_SIGNALS,
  decided: [],
};

export const OPTIONS: OpportunityPageOptions = {
  spaces: [
    { id: 'space-personal', name: 'Personal', slug: 'personal' },
    { id: 'space-acme', name: 'Acme', slug: 'acme' },
  ],
  productLines: [
    { id: 'line-payments', name: 'Payments' },
    { id: 'line-growth', name: 'Growth' },
  ],
  projects: [{ id: 'project-pay', name: 'Payments' }],
};

/** A RunAction for stories: runs the (mocked) action and reports success. */
export const runInStory: RunAction = async (action) => (await action()).ok;

export const THEMES: FeedbackTheme[] = [
  {
    key: 'sig-timeout-1',
    label: 'checkout guest timeout',
    signals: [
      { ...LOOSE_SIGNALS[0], id: 'sig-timeout-1', title: 'Guest checkout times out' },
      { ...LOOSE_SIGNALS[0], id: 'sig-timeout-2', title: 'Checkout timeout for guests' },
      { ...LOOSE_SIGNALS[0], id: 'sig-timeout-3', title: 'Guest checkout timeout again' },
    ],
    evidence: { signals: 3, customers: 3, revenueAtStake: 7000, urgentSignals: 1 },
  },
];

export const FEEDBACK_KEYS: FeedbackKeyView[] = [
  {
    id: 'key-zendesk',
    spaceId: 'space-acme',
    name: 'Zendesk',
    prefix: 'shep_fb_x7Kq',
    lastUsedAt: T,
    createdAt: T,
    updatedAt: T,
  },
  {
    id: 'key-old',
    spaceId: 'space-acme',
    name: 'Old widget',
    prefix: 'shep_fb_P2nm',
    revokedAt: T,
    createdAt: T,
    updatedAt: T,
  },
];
