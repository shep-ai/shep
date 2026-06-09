/**
 * Lifecycle Context
 *
 * Module-level singleton that allows graph nodes to update the feature's
 * SDLC lifecycle as they execute, following the same pattern as
 * phase-timing-context.ts.
 *
 * The worker calls setLifecycleContext() once after DI init, passing an
 * UpdateFeatureLifecycleUseCase instance. Nodes call updateNodeLifecycle()
 * at the start of execution. Errors are swallowed so lifecycle updates
 * never block graph execution.
 *
 * Routing lifecycle updates through UpdateFeatureLifecycleUseCase ensures
 * that CheckAndUnblockFeaturesUseCase fires on every transition,
 * automatically unblocking blocked children that are now eligible to start.
 */

import { SdlcLifecycle } from '@/domain/generated/output.js';

/**
 * Minimal interface satisfied by UpdateFeatureLifecycleUseCase.
 * Using a structural interface avoids a concrete import between infrastructure
 * and application layer classes.
 */
interface LifecycleUpdater {
  execute(input: { featureId: string; lifecycle: SdlcLifecycle }): Promise<void>;
}

let contextFeatureId: string | undefined;
let contextUpdater: LifecycleUpdater | undefined;

/** Map graph node names to their corresponding SDLC lifecycle stage. */
const NODE_TO_LIFECYCLE: Record<string, SdlcLifecycle> = {
  analyze: SdlcLifecycle.Analyze,
  requirements: SdlcLifecycle.Requirements,
  research: SdlcLifecycle.Research,
  plan: SdlcLifecycle.Planning,
  implement: SdlcLifecycle.Implementation,
  'fast-implement': SdlcLifecycle.Implementation,
  'prototype-generate': SdlcLifecycle.Exploring,
  merge: SdlcLifecycle.Review,
};

/**
 * Set the lifecycle context. Called once by the worker after DI init.
 *
 * @param featureId - The feature being processed.
 * @param updater   - An UpdateFeatureLifecycleUseCase instance (or compatible updater).
 */
export function setLifecycleContext(featureId: string, updater: LifecycleUpdater): void {
  contextFeatureId = featureId;
  contextUpdater = updater;
}

/**
 * Clear the lifecycle context. Useful for testing.
 */
export function clearLifecycleContext(): void {
  contextFeatureId = undefined;
  contextUpdater = undefined;
}

/**
 * Update the feature's lifecycle to match the current graph node.
 * Routes through UpdateFeatureLifecycleUseCase so that
 * CheckAndUnblockFeaturesUseCase fires on every transition.
 * No-op if context is not set or the node name has no lifecycle mapping.
 */
export async function updateNodeLifecycle(nodeName: string): Promise<void> {
  if (!contextFeatureId || !contextUpdater) return;

  const lifecycle = NODE_TO_LIFECYCLE[nodeName];
  if (!lifecycle) return;

  try {
    await contextUpdater.execute({ featureId: contextFeatureId, lifecycle });
  } catch {
    // Swallow — lifecycle update failure is non-fatal
  }
}
