'use server';

import { getSettings } from '@shepai/core/infrastructure/services/settings.service';
import { BuildMode } from '@shepai/core/domain/generated/output';
import { normalizeBuildMode } from '@shepai/core/domain/shared/build-mode';

export interface WorkflowDefaults {
  approvalGates: {
    allowPrd: boolean;
    allowPlan: boolean;
    allowMerge: boolean;
  };
  push: boolean;
  openPr: boolean;
  ciWatchEnabled: boolean;
  enableEvidence: boolean;
  commitEvidence: boolean;
  defaultMode: BuildMode;
  injectSkills: boolean;
}

export async function getWorkflowDefaults(): Promise<WorkflowDefaults> {
  const settings = getSettings();
  const { workflow } = settings;

  return {
    approvalGates: {
      allowPrd: workflow.approvalGateDefaults.allowPrd,
      allowPlan: workflow.approvalGateDefaults.allowPlan,
      allowMerge: workflow.approvalGateDefaults.allowMerge,
    },
    push: workflow.approvalGateDefaults.pushOnImplementationComplete,
    openPr: workflow.openPrOnImplementationComplete,
    ciWatchEnabled: workflow.ciWatchEnabled,
    enableEvidence: workflow.enableEvidence,
    commitEvidence: workflow.commitEvidence,
    // Settings persist the legacy capitalized labels ('Regular' | 'Fast' |
    // 'Exploration'); the UI compares against BuildMode. Normalize here so no
    // consumer ever compares 'Fast' against BuildMode.Fast and loses.
    defaultMode: normalizeBuildMode(workflow.defaultMode, BuildMode.Fast),
    injectSkills: workflow.skillInjection?.enabled ?? false,
  };
}
