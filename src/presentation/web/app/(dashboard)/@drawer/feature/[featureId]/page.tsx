import { notFound } from 'next/navigation';
import { resolve } from '@/lib/server-container';
import type { IFeatureRepository } from '@shepai/core/application/ports/output/repositories/feature-repository.interface';
import type { IAgentRunRepository } from '@shepai/core/application/ports/output/agents/agent-run-repository.interface';
import { buildFeatureNodeData } from '@/app/build-feature-node-data';
import { getSettings } from '@shepai/core/infrastructure/services/settings.service';
import { computeDrawerView } from '@/components/common/control-center-drawer/drawer-view';
import { FeatureDrawerClient } from '@/components/common/control-center-drawer/feature-drawer-client';

/** Skip static pre-rendering since we need runtime DI container. */
export const dynamic = 'force-dynamic';

interface FeatureDrawerPageProps {
  params: Promise<{ featureId: string }>;
}

export default async function FeatureDrawerPage({ params }: FeatureDrawerPageProps) {
  const { featureId } = await params;

  // No try/catch here on purpose. This body spans resolve → findById →
  // getSettings → buildFeatureNodeData → computeDrawerView, and a catch-all
  // around all of it turned EVERY failure into `null`: the URL changed, the
  // drawer stayed shut, and nothing was reported anywhere. The one expected
  // outcome — no such feature — is handled explicitly below; anything else
  // belongs to the segment's error boundary (`@drawer/error.tsx`).
  const featureRepo = resolve<IFeatureRepository>('IFeatureRepository');
  const agentRunRepo = resolve<IAgentRunRepository>('IAgentRunRepository');

  // Critical path only: feature + agent run (fast DB lookups).
  // Expensive operations (git remote URL, GitHub CI/mergeable status,
  // artifact, repo name, base branch) are deferred to useDrawerSync
  // which runs client-side after the drawer is already visible.
  const feature = await featureRepo.findById(featureId);
  if (!feature) notFound();

  const run = feature.agentRunId ? await agentRunRepo.findById(feature.agentRunId) : null;
  const coordinationPeer = feature.coordination
    ? await featureRepo.findById(feature.coordination.peerFeatureId)
    : null;

  const { workflow, interactiveAgent } = getSettings();
  const nodeData = buildFeatureNodeData(feature, run, {
    enableEvidence: workflow.enableEvidence,
    commitEvidence: workflow.commitEvidence,
    ciWatchEnabled: workflow.ciWatchEnabled,
    coordinationPeerName: coordinationPeer?.name,
  });

  const view = computeDrawerView({
    selectedNode: nodeData,
    isCreateDrawerOpen: false,
    pendingRepositoryPath: '',
    pendingParentFeatureId: undefined,
    selectedRepoNode: null,
    features: [],
    workflowDefaults: undefined,
  });

  // A feature that exists but resolves to no drawer view is a legitimate
  // "nothing to show" — keep the slot empty rather than 404 the page.
  if (!view) return null;

  return (
    <FeatureDrawerClient view={view} interactiveAgentEnabled={interactiveAgent?.enabled ?? true} />
  );
}
