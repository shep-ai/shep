/**
 * Feature workflow defaults (spec 148).
 *
 * The build mode, approval gates, push and pull-request choices a user set in
 * Settings → Workflow, as feature-creation input. `shep feat new` fills unset
 * flags from it, and so does `CreateFeatureUseCase` when a caller that has no
 * flags of its own (A2A, MCP) asks for `useWorkflowDefaults`.
 *
 * Import convention for `domain/`: generated types only, no I/O, relative
 * imports without a file extension.
 */

import type { ApprovalGates, BuildMode, Settings } from '../generated/output';
import { normalizeBuildMode } from './build-mode';

export interface FeatureWorkflowDefaults {
  approvalGates: ApprovalGates;
  push: boolean;
  openPr: boolean;
  buildMode: BuildMode;
}

export function featureWorkflowDefaults(settings: Settings): FeatureWorkflowDefaults {
  const { approvalGateDefaults: gates } = settings.workflow;
  return {
    approvalGates: {
      allowPrd: gates.allowPrd,
      allowPlan: gates.allowPlan,
      allowMerge: gates.allowMerge,
    },
    push: gates.pushOnImplementationComplete,
    openPr: settings.workflow.openPrOnImplementationComplete,
    // Settings persist legacy capitalized labels ('Regular' | 'Fast' | 'Exploration').
    buildMode: normalizeBuildMode(settings.workflow.defaultMode),
  };
}
