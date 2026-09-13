import type { FleetData } from '@/app/actions/fleet-data';
import type {
  FleetTriageCategory,
  FleetTriageItem,
  FleetTriagePriority,
  FleetOverview,
} from '@shepai/core/domain/generated/output';

/**
 * Storybook mock for the fleet server action.
 *
 * `@shepai/core` is linked under `src/presentation/web/node_modules` only, so
 * this directory cannot resolve it at runtime. Everything below is therefore a
 * type-only import plus plain strings cast to the generated enum types —
 * importing the enums as values breaks the Storybook build.
 */

const NOW = '2026-09-11T12:00:00.000Z';

const P1 = 'P1' as FleetTriagePriority;
const P2 = 'P2' as FleetTriagePriority;

function overview(overrides: Partial<FleetOverview['counts']> = {}): FleetOverview {
  return {
    counts: {
      total: 52,
      cruising: 42,
      queued: 5,
      attentionNeeded: 3,
      failed: 2,
      waitingApproval: 3,
      blockedQuestions: 1,
      ...overrides,
    },
    circuitBreakerTripped: false,
    activeTriageCount: 0,
    consecutiveFailures: 0,
    timestamp: NOW,
  };
}

export async function getFleetData(_repositoryPath?: string): Promise<FleetData> {
  const triageItems: FleetTriageItem[] = [
    {
      featureId: 'feat-1',
      featureName: 'Needs Plan Approval',
      slug: 'needs-plan',
      priority: P1,
      category: 'gate' as FleetTriageCategory,
      reason: 'Waiting on the plan approval gate',
      runId: 'run-1',
      gateType: 'plan',
      worktreePath: '/tmp/wt-1',
      createdAt: NOW,
    },
    {
      featureId: 'feat-2',
      featureName: 'Auth SSO',
      slug: 'auth-sso',
      priority: P1,
      category: 'question' as FleetTriageCategory,
      reason: 'Blocking question: Should we support SAML 2.0 or OIDC?',
      runId: 'run-2',
      createdAt: NOW,
    },
    {
      featureId: 'feat-3',
      featureName: 'CSV Export',
      slug: 'csv-export',
      priority: P2,
      category: 'ci_failed' as FleetTriageCategory,
      reason: 'CI is failing on the pull request',
      runId: 'run-3',
      createdAt: NOW,
    },
  ];

  return {
    overview: { ...overview(), activeTriageCount: triageItems.length },
    triageItems,
  };
}
