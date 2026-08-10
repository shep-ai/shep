'use client';

import { createContext, useContext, useState, useMemo, type ReactNode } from 'react';
import type { FeatureNodeState } from '@/components/common/feature-node/feature-node-state-config';
import type { FeatureStatus } from '@/components/common/feature-status-config';

// Re-export the FeatureItem type so consumers can import from one place.
// This will gain `featureId` in a later phase.
export interface SidebarFeatureItem {
  name: string;
  status: FeatureStatus;
  featureId: string;
  startedAt?: number;
  duration?: string;
  agentType?: string;
  modelId?: string;
  /** Absolute path to the repository this feature belongs to */
  repositoryPath: string;
  /** Human-readable repository name (last path segment) */
  repositoryName: string;
}

// ---------------------------------------------------------------------------
// Pure mapping: FeatureNodeState (6-state) → FeatureStatus (5-state) | null
// ---------------------------------------------------------------------------

const stateMapping: Record<FeatureNodeState, FeatureStatus | null> = {
  'action-required': 'action-needed',
  running: 'in-progress',
  done: 'done',
  blocked: 'blocked',
  pending: 'pending',
  error: 'error',
  creating: null,
  deleting: null,
  archived: null,
};

/**
 * Maps a canvas FeatureNodeState to the sidebar's 5-state FeatureStatus.
 * Returns `null` for `creating` (optimistic UI) — these should be excluded from the sidebar.
 */
export function mapNodeStateToSidebarStatus(state: FeatureNodeState): FeatureStatus | null {
  return stateMapping[state];
}

// ---------------------------------------------------------------------------
// SidebarFeaturesContext
// ---------------------------------------------------------------------------

interface SidebarFeaturesContextValue {
  features: SidebarFeatureItem[];
  setFeatures: (features: SidebarFeatureItem[]) => void;
  hasRepositories: boolean;
  setHasRepositories: (value: boolean) => void;
}

const SidebarFeaturesContext = createContext<SidebarFeaturesContextValue | null>(null);

interface SidebarFeaturesProviderProps {
  children: ReactNode;
  initialHasRepositories?: boolean;
}

export function SidebarFeaturesProvider({
  children,
  initialHasRepositories = false,
}: SidebarFeaturesProviderProps) {
  const [features, setFeatures] = useState<SidebarFeatureItem[]>([]);
  const [hasRepositories, setHasRepositories] = useState(initialHasRepositories);

  const value = useMemo<SidebarFeaturesContextValue>(
    () => ({ features, setFeatures, hasRepositories, setHasRepositories }),
    [features, hasRepositories]
  );

  return (
    <SidebarFeaturesContext.Provider value={value}>{children}</SidebarFeaturesContext.Provider>
  );
}

export function useSidebarFeaturesContext(): SidebarFeaturesContextValue {
  const ctx = useContext(SidebarFeaturesContext);
  if (!ctx) {
    throw new Error('useSidebarFeaturesContext must be used within a <SidebarFeaturesProvider>');
  }
  return ctx;
}
