'use client';

import type { Application } from '@shepai/core/domain/generated/output';
import { ApplicationStatus, DeploymentState } from '@shepai/core/domain/generated/output';
import type { ChatState } from '@shepai/core/application/ports/output/services/interactive-session-service.interface';
import { featureIdForApplication } from '@shepai/core/domain/shared/feature-id';

import { ChatTab } from '@/components/features/chat/ChatTab';
import type { ApplicationErrorState, ScaffoldingState } from '@/components/features/chat/ChatTab';
import { APPLICATION_CREATION_PLACEHOLDER_STEPS } from '@/components/features/chat/workflow-placeholder';
import { useCloudDeployAction } from '@/hooks/use-cloud-deploy-action';
import { useDeployAction } from '@/hooks/use-deploy-action';
import { useTurnStatus } from '@/hooks/turn-statuses-provider';

import { AppTopBar } from './app-top-bar';
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
}

export function ApplicationPage({ application, initialChatState }: ApplicationPageProps) {
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

  // Derive a recovery-banner payload for ChatTab when the application
  // is in a broken state. The server-side
  // `application.status === Error` flag is the authoritative signal:
  // the setup / build pipeline crashed, was logged, and the row was
  // stamped. Without a visible banner the user would otherwise only
  // see a red "ERROR" pill in the top bar with no explanation. The
  // `/resume` endpoint re-runs the last failed step, so the banner
  // is always retryable when we render it.
  const applicationError: ApplicationErrorState | null =
    application.status === ApplicationStatus.Error
      ? {
          kind: 'Setup failed',
          message:
            'The last setup run errored out before it could finish. Click Try again to re-run the failed step, or open the Smart Deploy activity log from the top bar to see what went wrong.',
          retryable: true,
        }
      : null;

  return (
    // `h-full` (not `h-dvh`) so the page fills its shell's main area
    // exactly — in the apps-only surface the main is `viewport - topbar`,
    // and `h-dvh` would make this 40px taller than its container and
    // trigger an outer scrollbar over the whole window.
    <div className="bg-background flex h-full flex-col">
      <AppTopBar
        application={application}
        activeView={activeView}
        onViewChange={handleViewChange}
        agentRunning={agentRunning}
        initialChatState={initialChatState}
        deploy={deploy}
        cloudDeploy={cloudDeploy}
      />
      <ResizableSplit
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
            onAllStepsComplete={() => {
              // CRITICAL: only auto-deploy on the VERY FIRST completion
              // of the setup workflow. `application.setupComplete` is
              // set to `true` by the use case right after the workflow
              // finishes, and persists on the Application row forever.
              //
              //   - Fresh app: SSR prop is `false` (workflow hasn't
              //     completed yet) → we auto-fire → dev server starts →
              //     use case later sets setupComplete = true.
              //   - Revisit: SSR prop is `true` → we skip. If the user
              //     explicitly stopped the dev server before leaving,
              //     they stay stopped. Respect the explicit state — do
              //     NOT silently re-start the preview on every return
              //     to the app page.
              //
              // This gate replaces an earlier "once per mount" ref
              // guard that reset on every remount (React remounts the
              // ChatTab when the user navigates back), which caused
              // the auto-deploy to fire on every revisit.
              if (application.setupComplete) return;

              // First-ever completion path. Guard against double-fires
              // mid-transition (Ready/Booting/in-flight deployLoading)
              // just in case something else kicks the deploy before us.
              if (
                deploy.status !== DeploymentState.Ready &&
                deploy.status !== DeploymentState.Booting &&
                !deploy.deployLoading
              ) {
                void deploy.deploy();
              }
            }}
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
