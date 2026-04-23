'use client';

/**
 * useDevServerCoordinator
 *
 * Owns the dev-server <-> agent turn orchestration that previously lived
 * inline inside ApplicationPage. Responsibilities:
 *
 *   - Stop the dev server when the agent starts a turn (because the code
 *     it's about to change is exactly what the dev server is running).
 *   - Remember whether the dev server was running before the agent
 *     started so we can RESTART it (not cold-start it) when the turn
 *     finishes.
 *   - Auto-switch the right pane to the Web tab the first time the dev
 *     server reaches Ready after a cold start, so the user lands on
 *     their running app with zero clicks.
 *   - Prevent the user from manually selecting the Web tab while the
 *     agent is running — the preview is torn down.
 *
 * The hook holds no business decisions beyond the above coordination —
 * all start/stop commands go through the existing dev-server use cases
 * via the injected `deploy` action (which itself calls into core use
 * cases). The hook is a thin presentation-layer coordinator.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { DeploymentState } from '@shepai/core/domain/generated/output';

import type { DeployActionState } from '@/hooks/use-deploy-action';

import type { AppView } from './app-view-tabs';

export interface UseDevServerCoordinatorInput {
  deploy: DeployActionState;
  agentRunning: boolean;
  initialView?: AppView;
}

export interface UseDevServerCoordinatorApi {
  activeView: AppView;
  handleViewChange: (view: AppView) => void;
  disabledTabs: AppView[];
}

const DEFAULT_INITIAL_VIEW: AppView = 'ide';

export function useDevServerCoordinator({
  deploy,
  agentRunning,
  initialView = DEFAULT_INITIAL_VIEW,
}: UseDevServerCoordinatorInput): UseDevServerCoordinatorApi {
  const [activeView, setActiveView] = useState<AppView>(initialView);

  // Track whether the agent was running on the previous render so we can
  // detect the start/end transitions.
  const prevAgentRunningRef = useRef(false);

  // Track whether the dev server was running before the agent started,
  // so we only restart it (not cold-start) after the agent finishes.
  const wasRunningBeforeAgentRef = useRef(false);

  useEffect(() => {
    const wasRunning = prevAgentRunningRef.current;
    prevAgentRunningRef.current = agentRunning;

    if (agentRunning && !wasRunning) {
      // Agent just started — stop the dev server if running, remember
      // that it was running so we can restart after.
      if (deploy.status === DeploymentState.Ready || deploy.status === DeploymentState.Booting) {
        wasRunningBeforeAgentRef.current = true;
        void deploy.stop();
      }
      // Intentionally no longer auto-switch away from the Web tab —
      // the Web pane renders a "Building your app…" stub while the
      // agent works so the user can stay on the tab and watch progress.
    }

    if (!agentRunning && wasRunning) {
      // Agent just finished — restart the dev server if it was
      // previously running.
      if (wasRunningBeforeAgentRef.current) {
        wasRunningBeforeAgentRef.current = false;
        void deploy.deploy();
      }
    }
  }, [agentRunning, deploy]);

  // When the dev server transitions to Ready, auto-switch the right
  // pane to the Web tab the first time it happens so the user
  // immediately sees their app without an extra click. Only triggers
  // on an Idle→Ready transition, not on every poll while Ready.
  const hasAutoSwitchedRef = useRef(false);
  useEffect(() => {
    if (deploy.status === DeploymentState.Ready && deploy.url && !hasAutoSwitchedRef.current) {
      hasAutoSwitchedRef.current = true;
      setActiveView('web');
    }
    if (deploy.status !== DeploymentState.Ready) {
      hasAutoSwitchedRef.current = false;
    }
  }, [deploy.status, deploy.url]);

  // Web tab stays clickable even while the agent is running — the
  // WebPreviewTab shows a building-in-progress stub in that window.
  const handleViewChange = useCallback((view: AppView) => {
    setActiveView(view);
  }, []);

  return {
    activeView,
    handleViewChange,
    disabledTabs: [] as AppView[],
  };
}
