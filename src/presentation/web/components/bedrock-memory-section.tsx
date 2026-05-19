'use client';

/**
 * BedrockMemorySection — client-side wrapper around BedrockMemoryPanel.
 *
 * Pages that can SSR-fetch the snapshot pass it directly to
 * BedrockMemoryPanel. Drawer/tab clients (Repository / Feature) live
 * inside a parallel-route boundary where adding a server fetch is
 * awkward — this wrapper does the initial fetch from the client using
 * the shared bedrock server actions, then forwards every prop to the
 * underlying panel.
 *
 * The wrapper is intentionally thin: no business logic, no error
 * handling beyond what the panel already renders. It exists purely so
 * the panel can be embedded inside existing client components without
 * threading server-side props through them.
 */

import { useEffect, useState } from 'react';

import type {
  BedrockHealth,
  BedrockMemorySnapshot,
  BedrockTargetKind,
} from '@shepai/core/domain/generated/output';

import {
  enableBedrockForTarget,
  getBedrockMemorySnapshot,
  shipBedrockForTarget,
  syncBedrockForTarget,
} from '@/app/actions/bedrock.action';

import { BedrockMemoryPanel, type BedrockMemoryPanelActions } from './bedrock-memory-panel';

export interface BedrockMemorySectionProps {
  targetKind: BedrockTargetKind;
  targetId: string;
  targetLabel: string;
  initialEnabled: boolean;
  /** Optional pre-fetched snapshot. When omitted, the section fetches on mount. */
  initialSnapshot?: BedrockMemorySnapshot | null;
  /** Optional pre-fetched health. */
  initialHealth?: BedrockHealth | null;
}

export function BedrockMemorySection({
  targetKind,
  targetId,
  targetLabel,
  initialEnabled,
  initialSnapshot = null,
  initialHealth = null,
}: BedrockMemorySectionProps) {
  const [snapshot, setSnapshot] = useState<BedrockMemorySnapshot | null>(initialSnapshot);

  useEffect(() => {
    if (initialSnapshot !== null) return;
    let cancelled = false;
    void (async () => {
      const fresh = await getBedrockMemorySnapshot(targetKind, targetId);
      if (cancelled) return;
      setSnapshot(fresh);
    })();
    return () => {
      cancelled = true;
    };
  }, [targetKind, targetId, initialSnapshot]);

  const actions: BedrockMemoryPanelActions = {
    enable: enableBedrockForTarget,
    sync: syncBedrockForTarget,
    ship: shipBedrockForTarget,
    refreshSnapshot: getBedrockMemorySnapshot,
  };

  return (
    <BedrockMemoryPanel
      targetKind={targetKind}
      targetId={targetId}
      targetLabel={targetLabel}
      initialEnabled={initialEnabled}
      initialSnapshot={snapshot}
      initialHealth={initialHealth}
      actions={actions}
    />
  );
}
