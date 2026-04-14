'use client';

import { LayoutGrid } from 'lucide-react';
import type { Application } from '@shepai/core/domain/generated/output';
import { DeploymentState } from '@shepai/core/domain/generated/output';
import type { ChatState } from '@shepai/core/application/ports/output/services/interactive-session-service.interface';
import { featureIdForApplication } from '@shepai/core/domain/shared/feature-id';

import { cn } from '@/lib/utils';
import { RunDevButton } from '@/components/features/application-page/run-dev-button';
import { DeployButton } from '@/components/features/application-page/deploy-button';
import { CreateGitHubRepoButton } from '@/components/features/application-page/create-github-repo-button';
import type { CloudDeployActionApi } from '@/hooks/use-cloud-deploy-action';
import type { DeployActionState } from '@/hooks/use-deploy-action';

import { CopyPromptButton } from './copy-prompt-button';
import { DeleteButton } from './delete-button';
import { PathCluster } from './path-cluster';
import { SessionChip } from './session-chip';
import { StatusPill } from './status-pill';
import type { AppView } from './view-switcher';
import { ViewSwitcher } from './view-switcher';

/** Single source of truth for top-bar height. Both panes hang off this
 *  so nothing misaligns horizontally between left and right. */
export const TOP_BAR_HEIGHT_CLASS = 'h-11';

export interface AppTopBarProps {
  application: Application;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  /** When true the agent is actively running — disable preview controls. */
  agentRunning: boolean;
  /** SSR-seeded chat state — used to initialize the session chip so it
   *  shows any already-captured sessionId/model before SSE updates
   *  arrive. Optional: the chip falls back to "—" when absent. */
  initialChatState?: ChatState;
  /** Shared dev-server deploy state (hoisted in ApplicationPage so the
   *  top-bar Preview button and the right-pane Web iframe use a single
   *  polling loop). */
  deploy: DeployActionState;
  /** Cloud deploy action state (spec 089). */
  cloudDeploy: CloudDeployActionApi;
}

export function AppTopBar({
  application,
  activeView,
  onViewChange,
  agentRunning,
  initialChatState,
  deploy,
  cloudDeploy,
}: AppTopBarProps) {
  return (
    <header
      className={cn(
        'bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b px-3 backdrop-blur',
        TOP_BAR_HEIGHT_CLASS
      )}
    >
      {/* ── Left: identity ────────────────────────────────────── */}
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-violet-500">
        <LayoutGrid className="h-3 w-3 text-white" />
      </div>

      <h1 className="min-w-0 truncate text-sm font-semibold">{application.name}</h1>

      <StatusPill
        applicationId={application.id}
        persistedStatus={application.status}
        deployReady={deploy.status === DeploymentState.Ready}
      />

      <Divider />

      {/* ── Middle: repo path + copy/open + branch ────────────── */}
      <PathCluster applicationId={application.id} repositoryPath={application.repositoryPath} />

      {/* ── Spacer ──────────────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Live session chip (model + short session id) ─────── */}
      <SessionChip
        featureId={featureIdForApplication(application.id)}
        initialChatState={initialChatState}
        persistedSessionId={application.agentSessionId}
      />

      {/* ── Copy generated prompt (debug) ───────────────────── */}
      <CopyPromptButton applicationId={application.id} />

      {/* ── Delete ─────────────────────────────────────────── */}
      <DeleteButton applicationId={application.id} applicationName={application.name} />

      {/* ── Create GitHub repo (spec 089, violation-free; gh CLI) ─── */}
      <CreateGitHubRepoButton
        applicationId={application.id}
        initialRemoteUrl={application.gitRemoteUrl ?? null}
        disabled={agentRunning}
      />

      {/* ── Cloud deploy (spec 089, pluggable providers) ─── */}
      <DeployButton deploy={cloudDeploy} disabled={agentRunning} />

      {/* ── Preview (install + npm run dev, persistent) ─── */}
      <RunDevButton deploy={deploy} disabled={agentRunning} />

      {/* ── View switcher ─────────────────────────────────────── */}
      <ViewSwitcher
        active={activeView}
        onChange={onViewChange}
        disabledTabs={agentRunning ? ['web'] : []}
      />
    </header>
  );
}

function Divider() {
  return <span className="bg-border/60 mx-1 h-4 w-px shrink-0" />;
}
