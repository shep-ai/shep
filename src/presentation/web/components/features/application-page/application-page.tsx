'use client';

import { useState } from 'react';
import type { Application, DeploymentState } from '@shepai/core/domain/generated/output';
import { ApplicationStatus } from '@shepai/core/domain/generated/output';
import type { ChatState } from '@shepai/core/application/ports/output/services/interactive-session-service.interface';
import type { InteractiveAgentSupport } from '@shepai/core/application/use-cases/interactive/get-interactive-agent-support.use-case';
import { featureIdForApplication } from '@shepai/core/domain/shared/feature-id';

import { ChatTab } from '@/components/features/chat/ChatTab';
import type { ScaffoldingState } from '@/components/features/chat/ChatTab';
import { APPLICATION_CREATION_PLACEHOLDER_STEPS } from '@/components/features/chat/workflow-placeholder';
import { useCloudDeployAction } from '@/hooks/use-cloud-deploy-action';
import { useDeployAction } from '@/hooks/use-deploy-action';
import { useTurnStatus } from '@/hooks/turn-statuses-provider';

import { AppTopBar } from './app-top-bar';
import { deriveApplicationErrorState } from './application-error-state';
import { ResizableSplit } from './resizable-split';
import { useDevServerCoordinator } from './use-dev-server-coordinator';
import { ViewBody } from './view-body';

/**
 * Snapshot of the application's live dev-server state at the moment
 * the server component rendered. Used to seed `useDeployAction` so
 * the top-bar Preview button and the right-pane Web iframe are both
 * correct on the very first client paint — no "No dev server
 * running" flash, no client-side round-trip latency.
 */
export interface InitialDeploymentSnapshot {
  state: DeploymentState;
  url: string | null;
}

export interface ApplicationPageProps {
  application: Application;
  /**
   * SSR-loaded chat state for this application — seeds the TanStack Query
   * cache inside ChatTab so the initial user message (posted on the server
   * by createApplication before navigation) renders on first paint.
   */
  initialChatState?: ChatState;
  /**
   * SSR-loaded dev-server deployment snapshot. When present and
   * non-Stopped, skips the client-side hydration fetch — the first
   * paint already shows the running URL.
   */
  initialDeployment?: InitialDeploymentSnapshot;
  /** Whether the application's agent can run chat sessions. */
  interactiveAgent?: InteractiveAgentSupport;
}

export function ApplicationPage({
  application,
  initialChatState,
  interactiveAgent,
}: ApplicationPageProps) {
  const [compactPane, setCompactPane] = useState<'left' | 'right'>('left');
  // Hoisted dev-server state — subscribes to the shared
  // DeploymentStatusProvider scoped to this application's id. The server
  // component seeds the provider with `initialDeployment` (if any) so
  // the first paint already has the running URL; the provider's
  // `ensureHydrated` effect fills in fresh state on mount when the seed
  // is absent (e.g. test environments where the server couldn't reach
  // the deployment service).
  const deploy = useDeployAction({
    targetId: application.id,
    targetType: 'application',
    repositoryPath: application.repositoryPath,
  });
  const cloudDeploy = useCloudDeployAction(application.id);

  // ── Agent-running detection ────────────────────────────────
  // While the agent is processing, the dev server is likely being
  // modified — disable preview and auto-restart when done.
  const turnStatus = useTurnStatus(featureIdForApplication(application.id));
  const agentRunning = turnStatus === 'processing';

  // All dev-server coordination lives in this hook — stop/restart
  // around agent turns, auto-switch to Web on Ready, prevent manual
  // Web selection while the agent is running.
  const { activeView, handleViewChange } = useDevServerCoordinator({
    deploy,
    agentRunning,
  });

  // Derive the synthetic scaffolding card state from the Application
  // entity. Scaffolding (`BunShadcnScaffolder`) runs BEFORE the agent
  // turn and has no real `workflow_steps` row, so the tracker would
  // otherwise show all-pending cards during an expensive `bun install`.
  // The card uses `application.createdAt` as the approximate start —
  // the Application row is persisted moments before the scaffolder
  // kicks off, so the duration is a couple of hundred ms high at most.
  //   - Error state: Application.status flipped to `Error` → failed.
  //   - Completed: `setupComplete` flipped to `true` → done.
  //   - Otherwise: still running.
  // `ChatTab` additionally forces `done` once real workflow rows arrive,
  // which covers the window between `setupComplete=false` and the
  // first workflow step SSE chunk.
  const scaffoldingState: ScaffoldingState = application.setupComplete
    ? {
        status: 'done',
        startedAt: new Date(application.createdAt).getTime(),
      }
    : application.status === ApplicationStatus.Error
      ? {
          status: 'failed',
          startedAt: new Date(application.createdAt).getTime(),
          error: 'Scaffolding failed — check the logs for details.',
        }
      : {
          status: 'running',
          startedAt: new Date(application.createdAt).getTime(),
        };

  // Recovery banner for ChatTab when setup failed or the agent cannot chat.
  const applicationError = deriveApplicationErrorState(application.status, interactiveAgent);

  return (
    // `h-full` (not `h-dvh`) so the page fills its shell's main area
    // exactly — in the apps-only surface the main is `viewport - topbar`,
    // and `h-dvh` would make this 40px taller than its container and
    // trigger an outer scrollbar over the whole window.
    <div className="bg-background @container flex h-full min-w-0 flex-col">
      <AppTopBar
        application={application}
        activeView={activeView}
        onViewChange={(view) => {
          handleViewChange(view);
          setCompactPane('right');
        }}
        agentRunning={agentRunning}
        initialChatState={initialChatState}
        deploy={deploy}
        cloudDeploy={cloudDeploy}
      />
      <ResizableSplit
        compactPane={compactPane}
        onCompactPaneChange={setCompactPane}
        left={
          <ChatTab
            featureId={featureIdForApplication(application.id)}
            applicationId={application.id}
            worktreePath={application.repositoryPath}
            initialAgent={application.agentType}
            initialModel={application.modelOverride}
            initialChatState={initialChatState}
            hideHeader
            workflowPlaceholder={APPLICATION_CREATION_PLACEHOLDER_STEPS}
            scaffoldingState={scaffoldingState}
            onResumeWorkflow={() => {
              void fetch(`/api/applications/${application.id}/resume`, { method: 'POST' });
            }}
            applicationError={applicationError}
          />
        }
        right={
          <ViewBody
            activeView={activeView}
            applicationId={application.id}
            terminalCwd={application.repositoryPath}
            deploy={deploy}
            isBuilding={!application.setupComplete || agentRunning}
          />
        }
      />
    </div>
  );
}
