'use client';

/**
 * useDevServerCoordinator
 *
 * Owns the dev-server <-> agent turn orchestration that previously lived
 * inline inside ApplicationPage. Responsibilities:
 *
 *   - Stop the dev server when the agent starts a turn (because the code
 *     it's about to change is exactly what the dev server is running).
 *   - When the agent finishes a turn, ensure the dev server is up so the
 *     user immediately sees the result of the iteration. This covers the
 *     initial build (agent ran during scaffolding/codegen, finishes →
 *     auto-start) AND every subsequent edit iteration. We deliberately
 *     do NOT gate this on "was the dev server running BEFORE the agent
 *     started?" — that gate (the old `wasRunningBeforeAgentRef`) left
 *     the user with no preview after the very first build (server was
 *     never running) and after any iteration where the user had not yet
 *     started the preview.
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

  useEffect(() => {
    const wasRunning = prevAgentRunningRef.current;
    prevAgentRunningRef.current = agentRunning;

    if (agentRunning && !wasRunning) {
      // Agent just started — stop the dev server if running so the
      // code it's about to change isn't being served stale.
      if (deploy.status === DeploymentState.Ready || deploy.status === DeploymentState.Booting) {
        void deploy.stop();
      }
      // Intentionally no longer auto-switch away from the Web tab —
      // the Web pane renders a "Building your app…" stub while the
      // agent works so the user can stay on the tab and watch progress.
    }

    if (!agentRunning && wasRunning) {
      // Agent just finished — ensure the dev server is up so the user
      // immediately sees the result. We always try to start it (no
      // "was it running before?" gate), and rely on the status guard
      // below to avoid double-firing when the server is already
      // coming up. This is the single source of truth for auto-deploy
      // on agent transitions; it covers the initial build AND every
      // iteration, both of which end with this transition.
      if (
        deploy.status !== DeploymentState.Ready &&
        deploy.status !== DeploymentState.Booting &&
        !deploy.deployLoading
      ) {
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
