/**
 * Every feature flag with the section it is listed under and a one-line
 * description (spec 133). The feature-flags view and `shep settings flags`
 * both render this list.
 *
 * `FEATURE_FLAG_CATALOG` is a total Record over the FeatureFlags keys, so a
 * flag added in TypeSpec without a catalog entry is a compile error.
 */
import { FeatureFlagGroup, type FeatureFlags } from '../generated/output';

export type FeatureFlagKey = keyof FeatureFlags;

export interface FeatureFlagDescriptor {
  key: FeatureFlagKey;
  group: FeatureFlagGroup;
  /** One line, in English: what turning the flag on enables. */
  description: string;
}

/** Listing order within a group follows the declaration order below. */
export const FEATURE_FLAG_CATALOG: Readonly<
  Record<FeatureFlagKey, Omit<FeatureFlagDescriptor, 'key'>>
> = {
  envDeploy: {
    group: FeatureFlagGroup.Platform,
    description: 'Environment deployment workflows',
  },
  projects: {
    group: FeatureFlagGroup.Platform,
    description: 'Projects pages and `shep project`, `item`, `cycle` and `intake`',
  },
  codeReview: {
    group: FeatureFlagGroup.Platform,
    description: 'AI code review of pull requests and `shep review`',
  },
  collaboration: {
    group: FeatureFlagGroup.Platform,
    description: 'Agent questions, supervisor agent and agent-to-agent messages',
  },
  githubImport: {
    group: FeatureFlagGroup.Platform,
    description: 'Import (clone or fork) GitHub repositories into Shep',
  },
  bedrockIntegration: {
    group: FeatureFlagGroup.Platform,
    description: 'Project Bedrock markdown memory for coding agents',
  },
  aspm: {
    group: FeatureFlagGroup.Platform,
    description: 'Security posture management (/aspm, `shep aspm`) and supply-chain enforcement',
  },
  spaces: {
    group: FeatureFlagGroup.SoftwareFactory,
    description: 'Spaces and product lines: /spaces and `shep space`',
  },
  trackers: {
    group: FeatureFlagGroup.SoftwareFactory,
    description: 'Linear and Jira sync: /connections, `shep connection`, `shep sync`',
  },
  knowledge: {
    group: FeatureFlagGroup.SoftwareFactory,
    description: 'Notion knowledge sources synced into a space: `shep knowledge`',
  },
  signals: {
    group: FeatureFlagGroup.SoftwareFactory,
    description: 'Customer and incident signals: `shep signal`',
  },
  opportunities: {
    group: FeatureFlagGroup.SoftwareFactory,
    description: 'Ranked opportunities: /opportunities and `shep opportunity`',
  },
  feedback: {
    group: FeatureFlagGroup.SoftwareFactory,
    description: 'Feedback intake and themes: POST /api/feedback and `shep feedback`',
  },
  discovery: {
    group: FeatureFlagGroup.SoftwareFactory,
    description: 'Agent discovery of opportunities: `shep discovery`',
  },
  incidents: {
    group: FeatureFlagGroup.SoftwareFactory,
    description: 'Incident triage: /incidents, POST /api/alerts and `shep incident`',
  },
  outcomes: {
    group: FeatureFlagGroup.SoftwareFactory,
    description: 'Outcomes of shipped work: `shep outcome`',
  },
  docsFirst: {
    group: FeatureFlagGroup.SoftwareFactory,
    description: 'Docs-first spaces: docs written while planning and a docs merge gate',
  },
  autopilot: {
    group: FeatureFlagGroup.SoftwareFactory,
    description: 'Autopilot passes per space: `shep autopilot`',
  },
  factory: {
    group: FeatureFlagGroup.SoftwareFactory,
    description: 'Factory status: /factory and `shep factory`',
  },
  clusters: {
    group: FeatureFlagGroup.Experimental,
    description: 'Kubernetes clusters: /clusters and `shep cluster`',
  },
  scheduledWorkflows: {
    group: FeatureFlagGroup.Experimental,
    description: 'Scheduled workflows: /workflows and `shep workflow`',
  },
  queryAwareHarness: {
    group: FeatureFlagGroup.Experimental,
    description: 'Query-aware agent harness: Shep Harness agent, /harness, `shep harness`',
  },
  whatsappDispatch: {
    group: FeatureFlagGroup.Experimental,
    description: 'Dispatch and steer agents from WhatsApp: `shep whatsapp`',
  },
  reactFileManager: {
    group: FeatureFlagGroup.Experimental,
    description: 'Built-in file manager instead of the native folder picker',
  },
  debug: {
    group: FeatureFlagGroup.Experimental,
    description: 'Debug panels and verbose client-side logging',
  },
};

const GROUP_ORDER: readonly FeatureFlagGroup[] = Object.values(FeatureFlagGroup);

/** Every flag, grouped in FeatureFlagGroup order. */
export function listFeatureFlagDescriptors(): FeatureFlagDescriptor[] {
  const entries = Object.entries(FEATURE_FLAG_CATALOG) as [
    FeatureFlagKey,
    Omit<FeatureFlagDescriptor, 'key'>,
  ][];
  return GROUP_ORDER.flatMap((group) =>
    entries.filter(([, entry]) => entry.group === group).map(([key, entry]) => ({ key, ...entry }))
  );
}

export function isFeatureFlagKey(value: string): value is FeatureFlagKey {
  return Object.prototype.hasOwnProperty.call(FEATURE_FLAG_CATALOG, value);
}
