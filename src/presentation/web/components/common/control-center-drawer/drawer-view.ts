import type { FeatureNodeData } from '@/components/common/feature-node';
import type { RepositoryNodeData } from '@/components/common/repository-node';
import type { ParentFeatureOption } from '@/components/common/feature-create-drawer/feature-create-drawer';
import type { WorkflowDefaults } from '@/app/actions/get-workflow-defaults';

/** Tab key matching FeatureDrawerTabs */
export type FeatureTabKey =
  | 'overview'
  | 'activity'
  | 'log'
  | 'plan'
  | 'prd-review'
  | 'tech-decisions'
  | 'product-decisions'
  | 'merge-review'
  | 'prototype'
  | 'chat';

/** All valid tab key values — used for URL param validation. */
export const VALID_TAB_KEYS: ReadonlySet<string> = new Set<FeatureTabKey>([
  'overview',
  'activity',
  'log',
  'plan',
  'prd-review',
  'tech-decisions',
  'product-decisions',
  'merge-review',
  'prototype',
  'chat',
]);

/** Type-guard: returns the value as FeatureTabKey if valid, otherwise undefined. */
export function parseTabKey(value: string | null | undefined): FeatureTabKey | undefined {
  if (value && VALID_TAB_KEYS.has(value)) return value as FeatureTabKey;
  return undefined;
}

/**
 * Discriminated union representing every possible drawer state in the control center.
 * Only one view can be active at a time.
 */
export type DrawerView =
  /** All feature views — tabs handle the lifecycle-specific content */
  | { type: 'feature'; node: FeatureNodeData; initialTab: FeatureTabKey }
  /** Feature creation form */
  | {
      type: 'feature-create';
      repositoryPath: string;
      initialParentId?: string;
      features: ParentFeatureOption[];
      workflowDefaults?: WorkflowDefaults;
    }
  /** Repository node actions */
  | { type: 'repository'; data: RepositoryNodeData };

/** Derives the initial tab from node lifecycle + state. */
export function deriveInitialTab(node: FeatureNodeData): FeatureTabKey {
  if (node.lifecycle === 'exploring') return 'prototype';
  if (node.lifecycle === 'requirements' && node.state === 'action-required') return 'prd-review';
  if (node.lifecycle === 'implementation' && node.state === 'action-required')
    return 'tech-decisions';
  if (node.lifecycle === 'review' && (node.state === 'action-required' || node.state === 'error'))
    return 'merge-review';
  return 'overview';
}

/**
 * Derives the active DrawerView from control-center state.
 * Priority: feature-create > selected-node > repository
 */
export function computeDrawerView({
  selectedNode,
  isCreateDrawerOpen,
  pendingRepositoryPath,
  pendingParentFeatureId,
  selectedRepoNode,
  features,
  workflowDefaults,
}: {
  selectedNode: FeatureNodeData | null;
  isCreateDrawerOpen: boolean;
  pendingRepositoryPath: string;
  pendingParentFeatureId: string | undefined;
  selectedRepoNode: RepositoryNodeData | null;
  features: ParentFeatureOption[];
  workflowDefaults: WorkflowDefaults | undefined;
}): DrawerView | null {
  if (isCreateDrawerOpen) {
    return {
      type: 'feature-create',
      repositoryPath: pendingRepositoryPath,
      initialParentId: pendingParentFeatureId,
      features,
      workflowDefaults,
    };
  }

  if (selectedNode) {
    return { type: 'feature', node: selectedNode, initialTab: deriveInitialTab(selectedNode) };
  }

  if (selectedRepoNode) {
    return { type: 'repository', data: selectedRepoNode };
  }

  return null;
}
