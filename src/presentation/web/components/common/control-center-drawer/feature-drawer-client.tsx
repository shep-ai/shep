'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useRouter, usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Trash2, Play, Square, Copy, Check, Archive, ArchiveRestore } from 'lucide-react';
import type {
  PrdApprovalPayload,
  QuestionSelectionChange,
} from '@shepai/core/domain/generated/output';
import type { FeatureMode } from '@shepai/core/domain/generated/output';
import { approveFeature } from '@/app/actions/approve-feature';
import { resumeFeature } from '@/app/actions/resume-feature';
import { startFeature } from '@/app/actions/start-feature';
import { stopFeature } from '@/app/actions/stop-feature';
import { rejectFeature } from '@/app/actions/reject-feature';
import { submitExplorationFeedback } from '@/app/actions/submit-exploration-feedback';
import { promoteExploration } from '@/app/actions/promote-exploration';
import { discardExploration } from '@/app/actions/discard-exploration';
import type { RejectAttachment } from '@/components/common/drawer-action-bar';
import { getFeatureArtifact } from '@/app/actions/get-feature-artifact';
import { getResearchArtifact } from '@/app/actions/get-research-artifact';
import { getMergeReviewData } from '@/app/actions/get-merge-review-data';
import { useFeatureFlags } from '@/hooks/feature-flags-context';
import { useSoundAction } from '@/hooks/use-sound-action';
import { useGuardedDrawerClose } from '@/hooks/drawer-close-guard';
import { useDeployAction } from '@/hooks/use-deploy-action';
import { useAgentEventsContext } from '@/hooks/agent-events-provider';
import { BaseDrawer } from '@/components/common/base-drawer';
import { DeploymentStatusBadge } from '@/components/common/deployment-status-badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DeleteFeatureDialog } from '@/components/common/delete-feature-dialog';
import { OpenActionMenu } from '@/components/common/open-action-menu';
import { FeatureDrawerTabs } from '@/components/common/feature-drawer-tabs';
import { useFeatureActions } from '@/components/common/feature-drawer/use-feature-actions';
import type { PrdQuestionnaireData } from '@/components/common/prd-questionnaire';
import type { TechDecisionsReviewData } from '@/components/common/tech-decisions-review';
import type { ProductDecisionsSummaryData } from '@/components/common/product-decisions-summary';
import type { MergeReviewData } from '@/components/common/merge-review';
import { resolveSseEventUpdates } from '@/components/common/feature-node/derive-feature-state';
import { deriveInitialTab } from './drawer-view';
import type { DrawerView, FeatureTabKey } from './drawer-view';
import { useArtifactFetch } from './use-artifact-fetch';
import { useDrawerSync } from './use-drawer-sync';
import { useBranchSyncStatus } from '@/hooks/use-branch-sync-status';
import { updateFeaturePinnedConfig } from '@/app/actions/update-feature-pinned-config';
import {
  canSwitchPinnedConfig,
  getPinnedConfigSelection,
  type PinnedConfigSelection,
} from '@/components/common/feature-drawer-tabs/pinned-config-utils';

export interface FeatureDrawerClientProps {
  view: DrawerView;
  /** Tab key extracted from the URL path segment (e.g. /feature/[id]/activity → 'activity'). */
  urlTab?: FeatureTabKey;
  /** When false, the Chat tab is hidden from the tab bar (FR-17). Defaults to true. */
  interactiveAgentEnabled?: boolean;
}

export function FeatureDrawerClient({
  view: initialView,
  urlTab,
  interactiveAgentEnabled = true,
}: FeatureDrawerClientProps) {
  const featureFlags = useFeatureFlags();
  const { t } = useTranslation('web');
  const router = useRouter();
  const rejectSound = useSoundAction('reject');

  // Track the view locally so SSE events can update the drawer type in real-time
  const [view, setView] = useState(initialView);
  const [pinnedConfigSelection, setPinnedConfigSelection] = useState<PinnedConfigSelection | null>(
    () => (initialView.type === 'feature' ? getPinnedConfigSelection(initialView.node) : null)
  );
  const [lastSavedPinnedConfig, setLastSavedPinnedConfig] = useState<PinnedConfigSelection | null>(
    () => (initialView.type === 'feature' ? getPinnedConfigSelection(initialView.node) : null)
  );
  const [pinnedConfigSaving, setPinnedConfigSaving] = useState(false);
  const [pinnedConfigError, setPinnedConfigError] = useState<string | null>(null);
  const syncedPinnedConfigKeyRef = useRef<string | null>(null);

  // Sync when server re-renders with new props (e.g. after navigation).
  // When reopening the SAME feature, merge server data into the existing view
  // to preserve enriched fields (repositoryName, baseBranch, oneLiner, remoteUrl)
  // that useDrawerSync added but the minimal server component doesn't provide.
  useEffect(() => {
    setView((prev) => {
      if (
        prev.type === 'feature' &&
        initialView.type === 'feature' &&
        prev.node.featureId === initialView.node.featureId
      ) {
        return {
          ...initialView,
          node: { ...prev.node, ...initialView.node },
        };
      }
      return initialView;
    });
  }, [initialView]);

  const featureNode = view.type === 'feature' ? view.node : null;
  const canSwitchPinnedConfigForFeature = featureNode
    ? canSwitchPinnedConfig(featureNode.state)
    : false;

  useEffect(() => {
    if (view.type !== 'feature' || pinnedConfigSaving) {
      return;
    }

    const nextSelection = getPinnedConfigSelection(view.node);
    const nextKey = nextSelection
      ? `${view.node.featureId}:${nextSelection.agentType}:${nextSelection.modelId}`
      : `${view.node.featureId}:none`;
    const changed = syncedPinnedConfigKeyRef.current !== nextKey;

    syncedPinnedConfigKeyRef.current = nextKey;
    setPinnedConfigSelection(nextSelection);
    setLastSavedPinnedConfig(nextSelection);
    if (changed) {
      setPinnedConfigError(null);
    }
  }, [view, pinnedConfigSaving]);

  // SSE: update drawer view when feature state changes
  const { events } = useAgentEventsContext();
  const processedCountRef = useRef(0);

  useEffect(() => {
    // Clamp cursor if events were pruned
    if (processedCountRef.current > events.length) {
      processedCountRef.current = 0;
    }
    if (!featureNode || events.length <= processedCountRef.current) return;

    const newEvents = events.slice(processedCountRef.current);
    processedCountRef.current = events.length;

    for (const update of resolveSseEventUpdates(newEvents)) {
      if (update.featureId !== featureNode.featureId) continue;

      // Skip SSE updates for features in 'deleting' state — prevents stale
      // events from overwriting the delete animation or triggering artifact
      // fetches (which would fail with "not found" for soft-deleted features).
      if (featureNode.state === 'deleting') continue;

      if (update.state !== undefined || update.lifecycle !== undefined) {
        // Update the node data AND re-derive the initial tab so the drawer
        // switches immediately (e.g. prd-review → overview when agent resumes).
        setView((prev) => {
          if (prev.type !== 'feature') return prev;
          const updatedNode = {
            ...prev.node,
            ...(update.state !== undefined && { state: update.state }),
            ...(update.lifecycle !== undefined && { lifecycle: update.lifecycle }),
          };
          return { ...prev, node: updatedNode, initialTab: deriveInitialTab(updatedNode) };
        });
      }
    }
  }, [events, featureNode]);

  // Derive open state from the URL. Next.js parallel routes preserve slot
  // content during soft navigation, so this component is NOT unmounted when
  // navigating to `/`. Instead, we watch the pathname and let Vaul handle
  // the close animation when the path no longer matches a feature route.
  const pathname = usePathname();
  const isOpen = pathname.startsWith('/feature/');

  // Targeted data sync: fetches fresh FeatureNodeData on drawer open and
  // periodically while open. Replaces router.refresh() to avoid full-page
  // re-renders that cause visible flashing and can reset form state.
  useDrawerSync(isOpen, featureNode?.featureId ?? null, setView);

  const onClose = useCallback(() => {
    router.push('/');
  }, [router]);

  // ── Chat input state (shared across all review views) ────────────────
  const [chatInput, setChatInput] = useState('');

  // ── PRD state ──────────────────────────────────────────────────────────
  const [prdData, setPrdData] = useState<PrdQuestionnaireData | null>(null);
  const [prdSelections, setPrdSelections] = useState<Record<string, string>>({});
  const [prdDefaultSelections, setPrdDefaultSelections] = useState<Record<string, string>>({});

  // ── Tech state ─────────────────────────────────────────────────────────
  const [techData, setTechData] = useState<TechDecisionsReviewData | null>(null);

  // ── Product decisions state (for tech review Product tab) ─────────────
  const [techProductData, setTechProductData] = useState<
    ProductDecisionsSummaryData | null | undefined
  >(undefined);

  // ── Merge state ────────────────────────────────────────────────────────
  const [mergeData, setMergeData] = useState<MergeReviewData | null>(null);

  // ── Delete state ───────────────────────────────────────────────────────
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // ── Archive state ─────────────────────────────────────────────────────
  const [isArchiving, setIsArchiving] = useState(false);

  // Reset archive loading spinner when the feature state or feature ID
  // changes (e.g. state flips to 'archived' / 'done' after the server
  // action, or the user navigates to a different feature drawer).
  const archiveResetKey = `${featureNode?.featureId}:${featureNode?.state}`;
  const prevArchiveResetKeyRef = useRef(archiveResetKey);
  useEffect(() => {
    if (archiveResetKey !== prevArchiveResetKeyRef.current) {
      prevArchiveResetKeyRef.current = archiveResetKey;
      setIsArchiving(false);
    }
  }, [archiveResetKey]);

  // ── Exploration state ────────────────────────────────────────────────
  const [isPrototypeSubmitting, setIsPrototypeSubmitting] = useState(false);

  // ── Shared reject state ────────────────────────────────────────────────
  const [isRejecting, setIsRejecting] = useState(false);
  const isRejectingRef = useRef(false);

  // Reset chat input whenever the initialTab changes (lifecycle transition)
  const initialTab = view.type === 'feature' ? view.initialTab : undefined;
  useEffect(() => {
    setChatInput('');
  }, [initialTab]);

  // ── Artifact refresh key ─────────────────────────────────────────────
  // Increments whenever state or lifecycle changes (via SSE or background sync),
  // forcing useArtifactFetch to re-fetch even when the featureId stays the same.
  // This fixes race conditions where the first fetch fires too early (e.g. merge
  // data requested before the PR is created) and subsequent state updates don't
  // trigger a re-fetch because the featureId dep hasn't changed.
  const artifactRefreshKeyRef = useRef(0);
  const prevStateRef = useRef(featureNode?.state);
  const prevLifecycleRef = useRef(featureNode?.lifecycle);
  if (
    featureNode?.state !== prevStateRef.current ||
    featureNode?.lifecycle !== prevLifecycleRef.current
  ) {
    prevStateRef.current = featureNode?.state;
    prevLifecycleRef.current = featureNode?.lifecycle;
    artifactRefreshKeyRef.current += 1;
  }
  const artifactRefreshKey = artifactRefreshKeyRef.current;

  // ── Data fetching ─────────────────────────────────────────────────────

  const prdFeatureId =
    featureNode?.lifecycle === 'requirements' && featureNode?.state === 'action-required'
      ? featureNode.featureId
      : null;
  const isLoadingPrd = useArtifactFetch(
    prdFeatureId,
    getFeatureArtifact,
    (result) => {
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.questionnaire) {
        setPrdData(result.questionnaire);
        const defaults: Record<string, string> = {};
        for (const q of result.questionnaire.questions) {
          const recommended = q.options.find((o) => o.recommended);
          if (recommended) defaults[q.id] = recommended.id;
        }
        setPrdSelections(defaults);
        setPrdDefaultSelections(defaults);
      }
    },
    () => {
      setPrdSelections({});
      setPrdDefaultSelections({});
      setPrdData(null);
    },
    'Failed to load questionnaire',
    artifactRefreshKey
  );

  const techFeatureId =
    featureNode?.lifecycle === 'implementation' && featureNode?.state === 'action-required'
      ? featureNode.featureId
      : null;
  const isLoadingTech = useArtifactFetch(
    techFeatureId,
    getResearchArtifact,
    (result) => {
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.techDecisions) setTechData(result.techDecisions);
    },
    () => setTechData(null),
    'Failed to load tech decisions',
    artifactRefreshKey
  );

  const isLoadingTechProduct = useArtifactFetch(
    techFeatureId,
    getFeatureArtifact,
    (result) => {
      if (result.productDecisions) setTechProductData(result.productDecisions);
    },
    () => setTechProductData(undefined),
    undefined,
    artifactRefreshKey
  );

  const mergeFeatureId =
    (featureNode?.lifecycle === 'review' &&
      (featureNode?.state === 'action-required' || featureNode?.state === 'error')) ||
    (featureNode?.lifecycle === 'maintain' && featureNode?.pr)
      ? featureNode.featureId
      : null;
  const isLoadingMerge = useArtifactFetch(
    mergeFeatureId,
    getMergeReviewData,
    (result) => {
      if ('error' in result) {
        toast.error(result.error);
        return;
      }
      setMergeData(result);
    },
    () => setMergeData(null),
    'Failed to load merge review data',
    artifactRefreshKey
  );

  // ── Close guard ──────────────────────────────────────────────────────
  const isChatDirty = chatInput.trim().length > 0;
  const isPrdDirty =
    featureNode?.lifecycle === 'requirements' &&
    featureNode?.state === 'action-required' &&
    Object.keys(prdDefaultSelections).some((k) => prdDefaultSelections[k] !== prdSelections[k]);
  const isDirty = isChatDirty || isPrdDirty;

  const onReset = useCallback(() => {
    setChatInput('');
    setPrdSelections({ ...prdDefaultSelections });
  }, [prdDefaultSelections]);

  const { attemptClose } = useGuardedDrawerClose({ open: isOpen, isDirty, onClose, onReset });

  // ── Approve / reject handlers ─────────────────────────────────────────

  const handleReject = useCallback(
    async (
      feedback: string,
      label: string,
      attachments: RejectAttachment[] = [],
      onDone?: () => void
    ) => {
      if (pinnedConfigSaving || !featureNode?.featureId) return;
      isRejectingRef.current = true;
      setIsRejecting(true);
      try {
        const attachmentPaths = attachments.map((a) => a.path).filter(Boolean);
        const notedAttachments = attachments.filter((a) => a.notes?.trim());
        const feedbackWithNotes =
          notedAttachments.length > 0
            ? `${feedback}\n\nImage notes:\n${notedAttachments.map((a) => `- @${a.path}: ${a.notes!.trim()}`).join('\n')}`
            : feedback;
        const result = await rejectFeature(
          featureNode.featureId,
          feedbackWithNotes,
          attachmentPaths
        );
        if (!result.rejected) {
          toast.error(result.error ?? `Failed to reject ${label.toLowerCase()}`);
          return;
        }
        rejectSound.play();
        setChatInput('');
        toast.success(`${label} rejected — agent re-iterating (iteration ${result.iteration})`);
        if (result.iterationWarning) {
          toast.warning(
            `Iteration ${result.iteration} — consider approving or adjusting feedback to avoid excessive iterations`
          );
        }
        // Optimistically update canvas node before SSE arrives (~500ms delay)
        window.dispatchEvent(
          new CustomEvent('shep:feature-approved', {
            detail: { featureId: featureNode.featureId },
          })
        );
        onClose();
        onDone?.();
      } finally {
        isRejectingRef.current = false;
        setIsRejecting(false);
      }
    },
    [featureNode, onClose, pinnedConfigSaving, rejectSound]
  );

  const handlePrdReject = useCallback(
    (feedback: string, attachments: RejectAttachment[]) =>
      handleReject(feedback, 'Requirements', attachments, () => setPrdSelections({})),
    [handleReject]
  );
  const handleTechReject = useCallback(
    (feedback: string, attachments: RejectAttachment[]) =>
      handleReject(feedback, 'Plan', attachments),
    [handleReject]
  );
  const handleMergeReject = useCallback(
    (feedback: string, attachments: RejectAttachment[]) =>
      handleReject(feedback, 'Merge', attachments),
    [handleReject]
  );

  const handleSimpleApprove = useCallback(
    async (label: string) => {
      if (pinnedConfigSaving || !featureNode?.featureId) return;
      const result = await approveFeature(featureNode.featureId);
      if (!result.approved) {
        toast.error(result.error ?? `Failed to approve ${label.toLowerCase()}`);
        return;
      }
      setChatInput('');
      toast.success(`${label} approved — agent resuming`);
      // Optimistically update canvas node before SSE arrives (~500ms delay)
      window.dispatchEvent(
        new CustomEvent('shep:feature-approved', {
          detail: { featureId: featureNode.featureId },
        })
      );
      onClose();
    },
    [featureNode, onClose, pinnedConfigSaving]
  );

  const handlePrdApprove = useCallback(
    async (_actionId: string) => {
      if (pinnedConfigSaving || view.type !== 'feature' || !featureNode) return;
      let payload: PrdApprovalPayload | undefined;
      if (prdData) {
        const changedSelections: QuestionSelectionChange[] = [];
        for (const [questionId, optionId] of Object.entries(prdSelections)) {
          const question = prdData.questions.find((q) => q.id === questionId);
          const option = question?.options.find((o) => o.id === optionId);
          if (question && option) {
            changedSelections.push({ questionId: question.question, selectedOption: option.label });
          }
        }
        payload = { approved: true, changedSelections };
      }
      const result = await approveFeature(featureNode.featureId, payload);
      if (!result.approved) {
        toast.error(result.error ?? 'Failed to approve requirements');
        return;
      }
      setChatInput('');
      toast.success('Requirements approved — agent resuming');
      // Optimistically update canvas node before SSE arrives (~500ms delay)
      window.dispatchEvent(
        new CustomEvent('shep:feature-approved', {
          detail: { featureId: featureNode.featureId },
        })
      );
      setPrdSelections({});
      onClose();
    },
    [view, featureNode, pinnedConfigSaving, prdData, prdSelections, onClose]
  );

  const handleTechApprove = useCallback(() => handleSimpleApprove('Plan'), [handleSimpleApprove]);
  const handleMergeApprove = useCallback(() => handleSimpleApprove('Merge'), [handleSimpleApprove]);

  const handleDelete = useCallback(
    async (featureId: string, cleanup?: boolean, cascadeDelete?: boolean, closePr?: boolean) => {
      setIsDeleting(true);
      // Close the delete dialog and drawer before the server action so the
      // user sees immediate feedback. We dispatch a DOM event so the canvas
      // control center can run its own optimistic delete flow (deleting state,
      // mutation guard, node removal) in parallel.
      setDeleteDialogOpen(false);
      window.dispatchEvent(
        new CustomEvent('shep:feature-delete-requested', {
          detail: { featureId, cleanup, cascadeDelete, closePr },
        })
      );
      router.push('/');
    },
    [router]
  );

  const handleArchive = useCallback(
    (featureId: string) => {
      setIsArchiving(true);
      window.dispatchEvent(
        new CustomEvent('shep:feature-archive-requested', {
          detail: { featureId },
        })
      );
      router.push('/');
    },
    [router]
  );

  const handleUnarchive = useCallback(
    (featureId: string) => {
      setIsArchiving(true);
      window.dispatchEvent(
        new CustomEvent('shep:feature-unarchive-requested', {
          detail: { featureId },
        })
      );
      router.push('/');
    },
    [router]
  );

  const handleRetry = useCallback(
    async (featureId: string) => {
      if (pinnedConfigSaving) return;
      const result = await resumeFeature(featureId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Feature resumed — agent restarting');
      window.dispatchEvent(
        new CustomEvent('shep:feature-approved', {
          detail: { featureId },
        })
      );
      setView((prev) => {
        if (prev.type !== 'feature') return prev;
        return { ...prev, node: { ...prev.node, state: 'running' } };
      });
    },
    [pinnedConfigSaving]
  );

  const handleStop = useCallback(async (featureId: string) => {
    const result = await stopFeature(featureId);
    if (!result.stopped) {
      toast.error(result.error ?? 'Failed to stop');
      return;
    }
    toast.success('Agent stopped');
    setView((prev) => {
      if (prev.type !== 'feature') return prev;
      return { ...prev, node: { ...prev.node, state: 'error' } };
    });
  }, []);

  const handleStart = useCallback(
    async (featureId: string) => {
      if (pinnedConfigSaving) return;
      const result = await startFeature(featureId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Feature started');
      // Optimistically update the drawer view
      setView((prev) => {
        if (prev.type !== 'feature') return prev;
        return { ...prev, node: { ...prev.node, state: 'running' } };
      });
    },
    [pinnedConfigSaving]
  );

  const handlePinnedConfigSave = useCallback(
    async (agentType: string, modelId: string): Promise<{ ok: boolean; error?: string }> => {
      if (!featureNode) {
        return { ok: false, error: 'Feature is not loaded' };
      }

      if (!canSwitchPinnedConfig(featureNode.state)) {
        return {
          ok: false,
          error: 'Pinned execution can only be changed before start, approval, or retry',
        };
      }

      const previousSelection = lastSavedPinnedConfig ?? getPinnedConfigSelection(featureNode);
      const nextSelection: PinnedConfigSelection = {
        agentType: agentType as PinnedConfigSelection['agentType'],
        modelId,
      };

      setPinnedConfigSelection(nextSelection);
      setPinnedConfigError(null);
      setPinnedConfigSaving(true);

      try {
        const result = await updateFeaturePinnedConfig(featureNode.featureId, agentType, modelId);
        if (!result.ok) {
          const error = result.error ?? 'Failed to save pinned config';
          setPinnedConfigSelection(previousSelection);
          setPinnedConfigError(error);
          toast.error(error);
          return { ok: false, error };
        }

        setLastSavedPinnedConfig(nextSelection);
        setView((prev) => {
          if (prev.type !== 'feature' || prev.node.featureId !== featureNode.featureId) {
            return prev;
          }

          return {
            ...prev,
            node: {
              ...prev.node,
              agentType: nextSelection.agentType,
              modelId,
            },
          };
        });

        return { ok: true };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Failed to save pinned config';
        setPinnedConfigSelection(previousSelection);
        setPinnedConfigError(message);
        toast.error(message);
        return { ok: false, error: message };
      } finally {
        setPinnedConfigSaving(false);
      }
    },
    [featureNode, lastSavedPinnedConfig]
  );

  // ── Exploration handlers ─────────────────────────────────────────────

  const handleSubmitFeedback = useCallback(
    async (feedback: string) => {
      if (!featureNode?.featureId) return;
      setIsPrototypeSubmitting(true);
      try {
        const result = await submitExplorationFeedback(featureNode.featureId, feedback);
        if (!result.submitted) {
          toast.error(result.error ?? 'Failed to submit feedback');
          return;
        }
        toast.success(`Feedback sent — generating iteration ${(result.iteration ?? 0) + 1}`);
        window.dispatchEvent(
          new CustomEvent('shep:feature-approved', {
            detail: { featureId: featureNode.featureId },
          })
        );
      } finally {
        setIsPrototypeSubmitting(false);
      }
    },
    [featureNode]
  );

  const handlePromote = useCallback(
    async (targetMode: FeatureMode.Regular | FeatureMode.Fast) => {
      if (!featureNode?.featureId) return;
      setIsPrototypeSubmitting(true);
      try {
        const result = await promoteExploration(featureNode.featureId, targetMode);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success(`Exploration promoted to ${targetMode === 'Fast' ? 'fast' : 'regular'} mode`);
        window.dispatchEvent(
          new CustomEvent('shep:feature-approved', {
            detail: { featureId: featureNode.featureId },
          })
        );
      } finally {
        setIsPrototypeSubmitting(false);
      }
    },
    [featureNode]
  );

  const handleDiscardExploration = useCallback(async () => {
    if (!featureNode?.featureId) return;
    setIsPrototypeSubmitting(true);
    try {
      const result = await discardExploration(featureNode.featureId);
      if (!result.discarded) {
        toast.error(result.error ?? 'Failed to discard exploration');
        return;
      }
      toast.success('Exploration discarded');
      window.dispatchEvent(
        new CustomEvent('shep:feature-delete-requested', {
          detail: { featureId: featureNode.featureId, cleanup: true },
        })
      );
      router.push('/');
    } finally {
      setIsPrototypeSubmitting(false);
    }
  }, [featureNode, router]);

  // ── Hooks (always called unconditionally per Rules of Hooks) ──────────

  const featureActionsInput =
    featureNode?.repositoryPath && featureNode?.branch
      ? {
          featureId: featureNode.featureId,
          repositoryPath: featureNode.repositoryPath,
          branch: featureNode.branch,
          worktreePath: featureNode.worktreePath,
          specPath: featureNode.specPath,
        }
      : null;
  const featureActions = useFeatureActions(featureActionsInput);

  // Branch sync status — only when the feature flag is on, the feature has a branch,
  // and the repository has a remote (no remote = no sync needed)
  const syncFeatureId =
    featureFlags.gitRebaseSync && featureNode?.branch && featureNode?.remoteUrl
      ? featureNode.featureId
      : null;
  const {
    data: syncData,
    loading: syncLoading,
    error: syncError,
    refresh: refreshSync,
  } = useBranchSyncStatus(syncFeatureId);

  // Auto-refresh sync status after a successful rebase
  const prevRebaseLoadingRef = useRef(featureActions.rebaseLoading);
  useEffect(() => {
    if (
      prevRebaseLoadingRef.current &&
      !featureActions.rebaseLoading &&
      !featureActions.rebaseError
    ) {
      refreshSync();
    }
    prevRebaseLoadingRef.current = featureActions.rebaseLoading;
  }, [featureActions.rebaseLoading, featureActions.rebaseError, refreshSync]);

  const featureDeployTarget =
    featureNode?.repositoryPath && featureNode.branch
      ? {
          targetId: featureNode.featureId,
          targetType: 'feature' as const,
          repositoryPath: featureNode.repositoryPath,
          branch: featureNode.branch,
        }
      : null;

  const deployAction = useDeployAction(featureDeployTarget);
  const isFeatureDeployActive =
    deployAction.status === 'Booting' || deployAction.status === 'Ready';

  // ── Short ID copy ───────────────────────────────────────────────────
  const COPY_FEEDBACK_DELAY = 2000;
  const [idCopied, setIdCopied] = useState(false);
  const handleCopyId = useCallback(() => {
    if (!featureNode?.featureId) return;
    void navigator.clipboard.writeText(featureNode.featureId);
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), COPY_FEEDBACK_DELAY);
  }, [featureNode?.featureId]);

  // ── Header ────────────────────────────────────────────────────────────

  let headerContent: React.ReactNode = undefined;

  if (featureNode) {
    const shortId = featureNode.featureId.slice(0, 8);
    {
      /* Reusable toolbar icon button classes */
    }
    const tbBtn =
      'text-muted-foreground hover:bg-foreground/8 hover:text-foreground inline-flex size-8 items-center justify-center rounded-[3px] disabled:opacity-40';
    const tbSep = 'bg-border/60 mx-1.5 h-5 w-px shrink-0';

    headerContent = (
      <div data-testid="feature-drawer-toolbar">
        <div className="flex h-10 items-center px-2" data-testid="feature-drawer-actions">
          {/* ── Left: Open + Run/Stop ── */}
          {featureActionsInput && featureNode?.state !== 'done' ? (
            <OpenActionMenu
              actions={featureActions}
              repositoryPath={featureActionsInput.repositoryPath}
              worktreePath={featureActionsInput.worktreePath}
              showSpecs={!!featureActionsInput.specPath}
            />
          ) : null}
          {featureActionsInput &&
          featureNode?.state !== 'done' &&
          featureFlags.envDeploy &&
          featureDeployTarget ? (
            <>
              <div className={tbSep} />
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      disabled={deployAction.deployLoading || deployAction.stopLoading}
                      onClick={isFeatureDeployActive ? deployAction.stop : deployAction.deploy}
                      className={cn(
                        'inline-flex size-7 items-center justify-center rounded-[3px] disabled:opacity-40',
                        isFeatureDeployActive
                          ? 'text-red-500 hover:bg-red-500/10 hover:text-red-400'
                          : 'text-green-600 hover:bg-green-500/10 dark:text-green-500'
                      )}
                      aria-label={
                        isFeatureDeployActive
                          ? t('featureDrawer.stopDevServer')
                          : t('featureDrawer.startDevServer')
                      }
                    >
                      {deployAction.deployLoading || deployAction.stopLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : isFeatureDeployActive ? (
                        <Square className="size-4" />
                      ) : (
                        <Play className="size-4" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {isFeatureDeployActive
                      ? t('featureDrawer.stopDevServer')
                      : t('featureDrawer.startDevServer')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {isFeatureDeployActive ? (
                <DeploymentStatusBadge
                  status={deployAction.status}
                  url={deployAction.url}
                  targetId={featureDeployTarget?.targetId}
                />
              ) : null}
            </>
          ) : null}

          {/* ── Spacer ── */}
          <div className="flex-1" />

          {/* ── Right: ID · archive · delete ── */}
          <div className="flex items-center">
            <code className="text-muted-foreground/70 font-mono text-[10px] tracking-wide select-none">
              {shortId}
            </code>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    className={tbBtn}
                    aria-label={t('featureDrawer.copyFeatureId')}
                    data-testid="feature-drawer-copy-id"
                  >
                    {idCopied ? (
                      <Check className="size-4 text-green-500" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  {t('featureDrawer.copyFeatureId')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {featureNode.featureId ? (
              <>
                <div className={tbSep} />
                <TooltipProvider delayDuration={300}>
                  {featureNode.state === 'archived' ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          disabled={isArchiving}
                          className={tbBtn}
                          data-testid="feature-drawer-unarchive"
                          onClick={() => handleUnarchive(featureNode.featureId)}
                        >
                          {isArchiving ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <ArchiveRestore className="size-3" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        {t('featureDrawer.unarchiveFeature')}
                      </TooltipContent>
                    </Tooltip>
                  ) : featureNode.state !== 'deleting' ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          disabled={isArchiving}
                          className={tbBtn}
                          data-testid="feature-drawer-archive"
                          onClick={() => handleArchive(featureNode.featureId)}
                        >
                          {isArchiving ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Archive className="size-3" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        {t('featureDrawer.archiveFeature')}
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={isDeleting}
                        className={cn(tbBtn, 'hover:bg-destructive/10 hover:text-destructive')}
                        data-testid="feature-drawer-delete"
                        onClick={() => setDeleteDialogOpen(true)}
                      >
                        {isDeleting ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-3" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {t('featureDrawer.deleteFeature')}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DeleteFeatureDialog
                  open={deleteDialogOpen}
                  onOpenChange={setDeleteDialogOpen}
                  onConfirm={(cleanup, cascadeDelete, closePr) =>
                    handleDelete(featureNode.featureId, cleanup, cascadeDelete, closePr)
                  }
                  isDeleting={isDeleting}
                  featureName={featureNode.name}
                  featureId={featureNode.featureId}
                  hasChildren={featureNode.hasChildren}
                  hasOpenPr={!!featureNode.pr && featureNode.pr.status === 'Open'}
                />
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  // ── Body ──────────────────────────────────────────────────────────────

  let body: React.ReactNode = null;

  if (view.type === 'feature' && featureNode) {
    const enrichedNode = {
      ...featureNode,
      ...(featureNode.state === 'error' && { onRetry: handleRetry }),
      ...(featureNode.state === 'pending' && { onStart: handleStart }),
    };
    body = (
      <FeatureDrawerTabs
        featureName={featureNode.name}
        headerContent={headerContent}
        featureNode={enrichedNode}
        featureId={featureNode.featureId}
        initialTab={view.initialTab}
        urlTab={urlTab}
        sseEvents={events}
        prdData={prdData}
        prdSelections={prdSelections}
        onPrdSelect={(qId, oId) => setPrdSelections((prev) => ({ ...prev, [qId]: oId }))}
        onPrdApprove={handlePrdApprove}
        onPrdReject={handlePrdReject}
        isPrdLoading={isLoadingPrd}
        techData={techData}
        onTechApprove={handleTechApprove}
        onTechReject={handleTechReject}
        isTechLoading={isLoadingTech}
        productData={isLoadingTechProduct ? null : techProductData}
        mergeData={mergeData}
        onMergeApprove={handleMergeApprove}
        onMergeReject={handleMergeReject}
        isMergeLoading={isLoadingMerge}
        syncStatus={syncFeatureId ? syncData : undefined}
        syncLoading={syncLoading}
        syncError={syncError}
        onRefreshSync={syncFeatureId ? refreshSync : undefined}
        onRebaseOnMain={syncFeatureId ? featureActions.rebaseOnMain : undefined}
        rebaseLoading={featureActions.rebaseLoading}
        rebaseError={featureActions.rebaseError}
        isRejecting={isRejecting}
        chatInput={chatInput}
        onChatInputChange={setChatInput}
        pinnedConfig={
          canSwitchPinnedConfigForFeature && pinnedConfigSelection
            ? {
                ...pinnedConfigSelection,
                saving: pinnedConfigSaving,
                error: pinnedConfigError,
                onSave: handlePinnedConfigSave,
              }
            : undefined
        }
        continuationActionsDisabled={pinnedConfigSaving}
        onSubmitFeedback={handleSubmitFeedback}
        onPromote={handlePromote}
        onDiscardExploration={handleDiscardExploration}
        isPrototypeSubmitting={isPrototypeSubmitting}
        interactiveAgentEnabled={interactiveAgentEnabled}
        onRetry={handleRetry}
        onStop={handleStop}
        onStart={handleStart}
      />
    );
  }

  return (
    <BaseDrawer
      open={isOpen}
      onClose={attemptClose}
      size="lg"
      modal={false}
      data-testid={view.type === 'feature' ? 'feature-drawer' : 'repository-drawer'}
    >
      {body}
    </BaseDrawer>
  );
}
