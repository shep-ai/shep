'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePathname } from 'next/navigation';
import {
  Loader2,
  AlertCircle,
  LayoutDashboard,
  Activity,
  ScrollText,
  Map,
  FileCheck,
  Cpu,
  Package,
  GitMerge,
  MessageSquare,
  Play,
  Square,
  RotateCcw,
  Zap,
  Layers,
  FlaskConical,
} from 'lucide-react';
import type { NotificationEvent } from '@shepai/core/domain/generated/output';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getFeaturePhaseTimings } from '@/app/actions/get-feature-phase-timings';
import type {
  PhaseTimingData,
  RejectionFeedbackData,
} from '@/app/actions/get-feature-phase-timings';
import { getFeaturePlan } from '@/app/actions/get-feature-plan';
import type { PlanData } from '@/app/actions/get-feature-plan';
import type { FeatureNodeData } from '@/components/common/feature-node';
import { cn } from '@/lib/utils';
import { featureNodeStateConfig } from '@/components/common/feature-node';
import { CometSpinner } from '@/components/ui/comet-spinner';
import type { PrdQuestionnaireData } from '@/components/common/prd-questionnaire';
import type { TechDecisionsReviewData } from '@/components/common/tech-decisions-review';
import type { ProductDecisionsSummaryData } from '@/components/common/product-decisions-summary';
import type { MergeReviewData } from '@/components/common/merge-review';
import { PrdQuestionnaire } from '@/components/common/prd-questionnaire';
import { TechDecisionsContent } from '@/components/common/tech-decisions-review';
import { ProductDecisionsSummary } from '@/components/common/product-decisions-summary';
import { MergeReview } from '@/components/common/merge-review';
import { DrawerActionBar } from '@/components/common/drawer-action-bar';
import type { RejectAttachment } from '@/components/common/drawer-action-bar';
import type { FeatureMode } from '@shepai/core/domain/generated/output';
import { OverviewTab } from './overview-tab';
import { ActivityTab } from './activity-tab';
import { LogTab } from './log-tab';
import { PlanTab } from './plan-tab';
import { PrototypeTab } from './prototype-tab';
import { ChatTab } from '@/components/features/chat/ChatTab';
import { useFeatureLogs } from '@/hooks/use-feature-logs';
import { useTabDataFetch } from './use-tab-data-fetch';
import type { TabFetchers } from './use-tab-data-fetch';
import type { FeatureTabKey } from '@/components/common/control-center-drawer/drawer-view';
import type { BranchSyncData } from '@/hooks/use-branch-sync-status';
import type { FeatureDrawerPinnedConfig } from './pinned-config-utils';

/** Lazy-loaded tab keys (tabs that fetch data on activation). */
type LazyTabKey = 'activity' | 'plan';

/** Tab definition for rendering the tab list dynamically. */
interface TabDef {
  key: FeatureTabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** All possible tabs in display order. */
const ALL_TABS: TabDef[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'prototype', label: 'Prototype', icon: FlaskConical },
  { key: 'activity', label: 'Activity', icon: Activity },
  { key: 'log', label: 'Log', icon: ScrollText },
  { key: 'plan', label: 'Plan', icon: Map },
  { key: 'prd-review', label: 'PRD Review', icon: FileCheck },
  { key: 'tech-decisions', label: 'Tech Decisions', icon: Cpu },
  { key: 'product-decisions', label: 'Product', icon: Package },
  { key: 'merge-review', label: 'Merge Review', icon: GitMerge },
  { key: 'chat', label: 'Chat', icon: MessageSquare },
];

/** Compute which tabs are visible based on feature lifecycle + state. */
function computeVisibleTabs(
  node: FeatureNodeData,
  interactiveAgentEnabled = true
): FeatureTabKey[] {
  const tabs: FeatureTabKey[] = ['overview'];

  // Exploration mode: show prototype tab, skip SDLC-specific tabs
  if (node.lifecycle === 'exploring') {
    tabs.push('prototype', 'activity');
    if (node.hasAgentRun) tabs.push('log');
    if (interactiveAgentEnabled) tabs.push('chat');
    return tabs;
  }

  tabs.push('activity');

  if (node.hasAgentRun) {
    tabs.push('log');
  }

  if (node.hasPlan) {
    tabs.push('plan');
  }
  if (node.lifecycle === 'requirements' && node.state === 'action-required') {
    tabs.push('prd-review');
  }
  if (node.lifecycle === 'implementation' && node.state === 'action-required') {
    tabs.push('tech-decisions', 'product-decisions');
  }
  if (node.lifecycle === 'review' && (node.state === 'action-required' || node.state === 'error')) {
    tabs.push('merge-review');
  }
  if (node.lifecycle === 'maintain' && node.pr) {
    tabs.push('merge-review');
  }

  // Chat tab is visible for ALL lifecycle phases when interactive agent is enabled
  if (interactiveAgentEnabled) {
    tabs.push('chat');
  }

  return tabs;
}

export interface FeatureDrawerTabsProps {
  /** Feature name rendered in the inline header. */
  featureName?: string;
  /** Additional header content (repo info, actions) rendered below the title row. */
  headerContent?: React.ReactNode;
  featureNode: FeatureNodeData;
  featureId: string;
  /** Action handlers for the status chip in the title row. */
  onRetry?: (featureId: string) => void;
  onStop?: (featureId: string) => void;
  onStart?: (featureId: string) => void;
  initialTab?: FeatureTabKey;
  /** Tab key from URL path segment (e.g. /feature/[id]/activity → 'activity'). */
  urlTab?: FeatureTabKey;
  /** SSE events from the agent events provider, used to trigger tab data refresh. */
  sseEvents?: readonly NotificationEvent[];

  // PRD review
  prdData?: PrdQuestionnaireData | null;
  prdSelections?: Record<string, string>;
  onPrdSelect?: (questionId: string, optionId: string) => void;
  onPrdApprove?: (actionId: string) => void;
  onPrdReject?: (feedback: string, attachments: RejectAttachment[]) => void;
  isPrdLoading?: boolean;

  // Tech decisions
  techData?: TechDecisionsReviewData | null;
  onTechApprove?: () => void;
  onTechReject?: (feedback: string, attachments: RejectAttachment[]) => void;
  isTechLoading?: boolean;

  // Product decisions
  productData?: ProductDecisionsSummaryData | null;

  // Merge review
  mergeData?: MergeReviewData | null;
  onMergeApprove?: () => void;
  onMergeReject?: (feedback: string, attachments: RejectAttachment[]) => void;
  isMergeLoading?: boolean;

  // Branch sync
  syncStatus?: BranchSyncData | null;
  syncLoading?: boolean;
  syncError?: string | null;
  onRefreshSync?: () => void;

  // Rebase
  onRebaseOnMain?: () => void;
  rebaseLoading?: boolean;
  rebaseError?: string | null;

  // Shared
  isRejecting?: boolean;
  chatInput?: string;
  onChatInputChange?: (value: string) => void;
  pinnedConfig?: FeatureDrawerPinnedConfig;
  continuationActionsDisabled?: boolean;

  // Exploration / Prototype
  onSubmitFeedback?: (feedback: string) => Promise<void>;
  onPromote?: (targetMode: FeatureMode.Regular | FeatureMode.Fast) => Promise<void>;
  onDiscardExploration?: () => Promise<void>;
  isPrototypeSubmitting?: boolean;

  // Interactive agent
  /** When false, the Chat tab is hidden from the tab bar (FR-17). Defaults to true. */
  interactiveAgentEnabled?: boolean;
}

interface ActivityData {
  timings: PhaseTimingData[];
  rejectionFeedback: RejectionFeedbackData[];
}

async function fetchActivity(featureId: string): Promise<ActivityData> {
  const result = await getFeaturePhaseTimings(featureId);
  if ('error' in result) throw new Error(result.error);
  return { timings: result.timings, rejectionFeedback: result.rejectionFeedback };
}

async function fetchPlan(featureId: string): Promise<PlanData | undefined> {
  const result = await getFeaturePlan(featureId);
  if ('error' in result) throw new Error(result.error);
  return result.plan;
}

const TAB_FETCHERS: TabFetchers<LazyTabKey> = {
  activity: fetchActivity,
  plan: fetchPlan,
};

export function FeatureDrawerTabs({
  featureName,
  headerContent,
  featureNode,
  featureId,
  initialTab,
  urlTab,
  prdData,
  prdSelections,
  onPrdSelect,
  onPrdApprove,
  onPrdReject,
  isPrdLoading,
  techData,
  onTechApprove,
  onTechReject,
  isTechLoading,
  productData,
  mergeData,
  onMergeApprove,
  onMergeReject,
  isMergeLoading,
  syncStatus,
  syncLoading,
  syncError,
  onRefreshSync,
  onRebaseOnMain,
  rebaseLoading,
  rebaseError,
  isRejecting,
  chatInput,
  onChatInputChange,
  pinnedConfig,
  continuationActionsDisabled = false,
  sseEvents,
  onSubmitFeedback,
  onPromote,
  onDiscardExploration,
  isPrototypeSubmitting,
  interactiveAgentEnabled = true,
  onRetry,
  onStop,
  onStart,
}: FeatureDrawerTabsProps) {
  const pathname = usePathname();

  const visibleTabs = useMemo(
    () => computeVisibleTabs(featureNode, interactiveAgentEnabled),
    [featureNode, interactiveAgentEnabled]
  );
  const visibleTabDefs = useMemo(
    () =>
      ALL_TABS.filter((t) => visibleTabs.includes(t.key)).map((t) =>
        t.key === 'merge-review' && featureNode.lifecycle === 'maintain'
          ? { ...t, label: 'Merge History' }
          : t
      ),
    [visibleTabs, featureNode.lifecycle]
  );

  // Derive the base path (without tab segment) from the current pathname.
  // e.g. /feature/abc123/activity → /feature/abc123
  const basePath = useMemo(() => {
    const match = pathname.match(/^(\/feature\/[^/]+)/);
    return match ? match[1] : pathname;
  }, [pathname]);

  // Resolve the effective initial tab: URL path tab > initialTab prop > 'overview'
  const effectiveInitial = useMemo(() => {
    if (urlTab && visibleTabs.includes(urlTab)) return urlTab;
    if (initialTab && visibleTabs.includes(initialTab)) return initialTab;
    return 'overview';
    // Only compute on mount — subsequent changes are handled by effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [activeTab, setActiveTab] = useState<FeatureTabKey>(effectiveInitial);

  // Only subscribe to log SSE when the log tab is active to avoid
  // opening an EventSource connection on every drawer open.
  const featureLogs = useFeatureLogs(activeTab === 'log' ? featureId : null);

  const { tabs, fetchTab, refreshTab } = useTabDataFetch<LazyTabKey>(featureId, TAB_FETCHERS);

  // Sync URL when active tab changes via user interaction.
  // Use window.history.pushState instead of router.push to avoid triggering a
  // server component re-render (which would remount the drawer).
  const isUserInteraction = useRef(false);
  useEffect(() => {
    if (!isUserInteraction.current) return;
    isUserInteraction.current = false;

    // Build the target URL from the base path + tab segment
    const targetUrl = activeTab === 'overview' ? basePath : `${basePath}/${activeTab}`;
    // Only update URL if it actually changed
    if (targetUrl !== pathname) {
      window.history.pushState(null, '', targetUrl);
    }
  }, [activeTab, basePath, pathname]);

  // Sync active tab from URL when pathname changes (e.g. browser back/forward).
  // Skip on initial mount — the effectiveInitial handles that via urlTab prop.
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (prevPathnameRef.current === pathname) return; // Skip initial mount
    prevPathnameRef.current = pathname;
    if (isUserInteraction.current) return; // Skip — this is our own navigation
    const segments = pathname.split('/');
    // pathname is /feature/[id] or /feature/[id]/[tab]
    const pathTab = segments.length >= 4 ? (segments[3] as FeatureTabKey) : undefined;
    const resolved = pathTab && visibleTabs.includes(pathTab) ? pathTab : 'overview';
    if (resolved !== activeTab) {
      setActiveTab(resolved as FeatureTabKey);
      if (resolved === 'activity' || resolved === 'plan') {
        fetchTab(resolved as LazyTabKey);
      }
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // On mount, sync the URL to reflect the effective initial tab when it was
  // derived from feature state (initialTab) rather than from the URL (urlTab).
  // Use replaceState so we don't add a duplicate history entry.
  const initialSyncDone = useRef(false);
  useEffect(() => {
    if (initialSyncDone.current) return;
    initialSyncDone.current = true;
    // Only sync if the effective tab came from initialTab (not from URL)
    if (!urlTab && effectiveInitial !== 'overview') {
      const targetUrl = `${basePath}/${effectiveInitial}`;
      if (targetUrl !== pathname) {
        window.history.replaceState(null, '', targetUrl);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trigger lazy fetch for URL-driven initial tab
  const initialFetchDone = useRef(false);
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;
    if (activeTab === 'activity' || activeTab === 'plan') {
      fetchTab(activeTab);
    }
  }, [activeTab, fetchTab]);

  // Reset tab when featureId changes
  const prevFeatureIdRef = useRef(featureId);
  useEffect(() => {
    if (prevFeatureIdRef.current !== featureId) {
      prevFeatureIdRef.current = featureId;
      setActiveTab('overview');
    }
  }, [featureId]);

  // When initialTab changes (e.g. SSE updates lifecycle), switch to it if visible
  // and sync the URL with replaceState so the address bar reflects the new tab.
  // Also trigger lazy fetch for the new tab so data is ready immediately.
  const prevInitialTabRef = useRef(initialTab);
  useEffect(() => {
    if (
      prevInitialTabRef.current !== initialTab &&
      initialTab &&
      visibleTabs.includes(initialTab)
    ) {
      prevInitialTabRef.current = initialTab;
      setActiveTab(initialTab);
      // Trigger lazy fetch for the new tab if it's a lazy-loaded tab
      if (initialTab === 'activity' || initialTab === 'plan') {
        fetchTab(initialTab as LazyTabKey);
      }
      // Sync URL to match the new tab
      const targetUrl = initialTab === 'overview' ? basePath : `${basePath}/${initialTab}`;
      if (targetUrl !== window.location.pathname) {
        window.history.replaceState(null, '', targetUrl);
      }
    }
  }, [initialTab, visibleTabs, basePath, fetchTab]);

  // If the active tab becomes invisible (lifecycle changed), fall back to overview
  // and sync the URL accordingly.
  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) {
      setActiveTab('overview');
      if (window.location.pathname !== basePath) {
        window.history.replaceState(null, '', basePath);
      }
    }
  }, [visibleTabs, activeTab, basePath]);

  // SSE refresh: re-fetch lazy tab data when relevant SSE events arrive
  // for this feature (e.g. PhaseCompleted, AgentStarted, AgentCompleted).
  // Always refresh 'activity' data (even if not the active tab) so switching
  // to the activity tab shows up-to-date timings without a loading flash.
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const sseProcessedRef = useRef(0);

  useEffect(() => {
    if (!sseEvents || sseEvents.length === 0) return;
    // Clamp cursor if events were pruned
    if (sseProcessedRef.current > sseEvents.length) {
      sseProcessedRef.current = 0;
    }
    if (sseEvents.length <= sseProcessedRef.current) return;

    const newEvents = sseEvents.slice(sseProcessedRef.current);
    sseProcessedRef.current = sseEvents.length;

    const hasRelevantEvent = newEvents.some((e) => e.featureId === featureId);
    if (!hasRelevantEvent) return;

    // Always refresh activity data so it stays current for when the user switches tabs
    refreshTab('activity' as LazyTabKey);

    const current = activeTabRef.current;
    if (current === 'plan') {
      refreshTab(current);
    }
  }, [sseEvents, featureId, refreshTab]);

  // Poll activity data while the feature is actively running.
  // SSE events only fire on state transitions (phase completed, lifecycle changed),
  // so during a long-running phase there are no events and the data goes stale.
  // Poll every 5s when the feature is in a working state to keep data fresh.
  const isFeatureActive = featureNode.state === 'running' || featureNode.state === 'creating';
  useEffect(() => {
    if (!isFeatureActive) return;
    const interval = setInterval(() => {
      refreshTab('activity' as LazyTabKey);
    }, 5000);
    return () => clearInterval(interval);
  }, [isFeatureActive, refreshTab]);

  const handleTabChange = useCallback(
    (value: string) => {
      const tab = value as FeatureTabKey;
      isUserInteraction.current = true;
      setActiveTab(tab);
      if (tab === 'activity' || tab === 'plan') {
        fetchTab(tab);
      }
    },
    [fetchTab]
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex min-h-0 flex-1 flex-col"
      >
        {/* VS Code-style tab bar — first row */}
        <TabsList className="bg-muted/50 h-auto w-full shrink-0 justify-start gap-0 rounded-none border-b p-0">
          {visibleTabDefs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="text-muted-foreground hover:bg-muted hover:text-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:border-t-primary [&:not([data-state=active])]:border-r-border relative h-auto rounded-none border-t-2 border-r border-t-transparent border-r-transparent bg-transparent px-3.5 py-2.5 text-[13px] font-normal shadow-none transition-none last:border-r-transparent data-[state=active]:shadow-none"
              >
                <Icon className="mr-1.5 size-4" />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {/* Persistent header — contrasting background */}
        <div className="bg-muted/40 shrink-0 border-b">
          {/* Feature / repo + status chip */}
          {featureName ? (
            <div
              className="flex h-12 items-stretch gap-2 pr-0 pl-4"
              data-testid="feature-drawer-header"
            >
              {/* Fast/SDLC icon */}
              <div className="flex items-center">
                {featureNode.fastMode ? (
                  <Zap className="size-4 shrink-0 text-amber-500" />
                ) : (
                  <Layers className="text-muted-foreground/50 size-4 shrink-0" />
                )}
              </div>
              {/* Feature name */}
              <h2 className="text-foreground flex min-w-0 items-center truncate text-base font-semibold tracking-tight">
                {featureName}
              </h2>
              {/* / repo */}
              {featureNode.repositoryName ? (
                <span className="animate-in fade-in flex shrink-0 items-center gap-1.5 self-center duration-200">
                  <span className="text-muted-foreground/30 text-sm">/</span>
                  {featureNode.remoteUrl ? (
                    <a
                      href={featureNode.remoteUrl as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground text-sm"
                    >
                      {featureNode.repositoryName}
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      {featureNode.repositoryName}
                    </span>
                  )}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 self-center">
                  <span className="text-muted-foreground/30 text-sm">/</span>
                  <span className="bg-muted h-4 w-16 animate-pulse rounded" />
                </span>
              )}

              {/* Status chip + action button */}
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="ml-auto flex shrink-0 cursor-default items-center self-stretch text-xs font-medium">
                      <div
                        className={cn(
                          'flex items-center gap-1.5 self-stretch px-3',
                          featureNodeStateConfig[featureNode.state].labelClass
                        )}
                      >
                        {featureNode.state === 'running' ? (
                          <CometSpinner size="sm" className="shrink-0" />
                        ) : (
                          (() => {
                            const I = featureNodeStateConfig[featureNode.state].icon;
                            return <I className="size-3.5 shrink-0" />;
                          })()
                        )}
                        {featureNodeStateConfig[featureNode.state].label}
                      </div>
                      {/* Inline action button */}
                      {featureNode.state === 'pending' && onStart ? (
                        <button
                          type="button"
                          onClick={() => onStart(featureNode.featureId)}
                          disabled={continuationActionsDisabled}
                          className="text-muted-foreground flex items-center gap-1 self-stretch px-3 hover:bg-green-500/10 hover:text-green-600 disabled:pointer-events-none disabled:opacity-50 dark:hover:text-green-400"
                          data-testid="feature-drawer-start-button"
                        >
                          <Play className="size-3.5" /> Start
                        </button>
                      ) : featureNode.state === 'error' && onRetry ? (
                        <button
                          type="button"
                          onClick={() => onRetry(featureNode.featureId)}
                          disabled={continuationActionsDisabled}
                          className="text-muted-foreground flex items-center gap-1 self-stretch px-3 hover:bg-red-500/10 hover:text-red-500 disabled:pointer-events-none disabled:opacity-50 dark:hover:text-red-400"
                          data-testid="feature-drawer-retry-button"
                        >
                          <RotateCcw className="size-3.5" /> Retry
                        </button>
                      ) : featureNode.state === 'running' && onStop ? (
                        <button
                          type="button"
                          onClick={() => onStop(featureNode.featureId)}
                          className="text-muted-foreground flex items-center gap-1 self-stretch px-3 hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400"
                          data-testid="feature-drawer-stop-button"
                        >
                          <Square className="size-3.5" /> Stop
                        </button>
                      ) : null}
                    </div>
                  </TooltipTrigger>
                  {featureNode.errorMessage ? (
                    <TooltipContent
                      side="bottom"
                      align="end"
                      sideOffset={4}
                      className="z-[100] max-w-xs cursor-pointer text-xs leading-relaxed select-text"
                      onClick={() => {
                        void navigator.clipboard.writeText(featureNode.errorMessage!);
                      }}
                    >
                      {featureNode.errorMessage}
                      <span className="text-muted-foreground ml-1 text-[10px] italic">
                        (click to copy)
                      </span>
                    </TooltipContent>
                  ) : null}
                </Tooltip>
              </TooltipProvider>
            </div>
          ) : null}
          {/* IDE toolbar */}
          {headerContent}
        </div>

        <TabsContent value="overview" className="mt-0 flex-1 overflow-y-auto">
          <OverviewTab
            data={featureNode}
            pinnedConfig={pinnedConfig}
            syncStatus={syncStatus}
            syncLoading={syncLoading}
            syncError={syncError}
            onRefreshSync={onRefreshSync}
            onRebaseOnMain={onRebaseOnMain}
            rebaseLoading={rebaseLoading}
            rebaseError={rebaseError}
          />
        </TabsContent>

        {/* Prototype tab — visible for exploration features */}
        {visibleTabs.includes('prototype') ? (
          <TabsContent value="prototype" className="mt-0 flex-1 overflow-y-auto">
            <PrototypeTab
              data={featureNode}
              onSubmitFeedback={onSubmitFeedback}
              onPromote={onPromote}
              onDiscard={onDiscardExploration}
              isSubmitting={isPrototypeSubmitting}
            />
          </TabsContent>
        ) : null}

        <TabsContent value="activity" className="mt-0 flex-1 overflow-y-auto">
          <ActivityTab
            timings={(tabs.activity.data as ActivityData | null)?.timings ?? null}
            loading={tabs.activity.loading}
            error={tabs.activity.error}
            rejectionFeedback={(tabs.activity.data as ActivityData | null)?.rejectionFeedback}
          />
        </TabsContent>

        <TabsContent value="log" className="mt-0 flex-1 overflow-hidden">
          <LogTab
            content={featureLogs.content}
            isConnected={featureLogs.isConnected}
            error={featureLogs.error}
          />
        </TabsContent>

        <TabsContent value="plan" className="mt-0 flex-1 overflow-y-auto">
          <PlanTab
            plan={tabs.plan.data as PlanData | null}
            loading={tabs.plan.loading}
            error={tabs.plan.error}
          />
        </TabsContent>

        {/* PRD Review tab */}
        {visibleTabs.includes('prd-review') ? (
          <TabsContent value="prd-review" className="mt-0 flex min-h-0 flex-1 flex-col">
            {prdData ? (
              <PrdQuestionnaire
                data={prdData}
                selections={prdSelections ?? {}}
                onSelect={onPrdSelect ?? (() => undefined)}
                onApprove={onPrdApprove ?? (() => undefined)}
                onReject={onPrdReject}
                isProcessing={Boolean((isPrdLoading ?? false) || continuationActionsDisabled)}
                isRejecting={isRejecting}
                chatInput={chatInput}
                onChatInputChange={onChatInputChange}
              />
            ) : (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
              </div>
            )}
          </TabsContent>
        ) : null}

        {/* Tech Decisions tab */}
        {visibleTabs.includes('tech-decisions') ? (
          <TabsContent value="tech-decisions" className="mt-0 flex min-h-0 flex-1 flex-col">
            {techData ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex-1 overflow-y-auto">
                  <TechDecisionsContent data={techData} />
                </div>
                <DrawerActionBarForTech
                  onApprove={onTechApprove ?? (() => undefined)}
                  onReject={onTechReject}
                  isProcessing={Boolean((isTechLoading ?? false) || continuationActionsDisabled)}
                  isRejecting={isRejecting}
                  chatInput={chatInput}
                  onChatInputChange={onChatInputChange}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
              </div>
            )}
          </TabsContent>
        ) : null}

        {/* Product Decisions tab */}
        {visibleTabs.includes('product-decisions') ? (
          <TabsContent value="product-decisions" className="mt-0 flex-1 overflow-y-auto">
            {productData === null ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
              </div>
            ) : productData ? (
              <ProductDecisionsSummary data={productData} />
            ) : (
              <p className="text-muted-foreground p-4 text-center text-sm">
                No product decisions available.
              </p>
            )}
          </TabsContent>
        ) : null}

        {/* Merge Review tab */}
        {visibleTabs.includes('merge-review') ? (
          <TabsContent value="merge-review" className="mt-0 flex min-h-0 flex-1 flex-col">
            {mergeData ? (
              <MergeReview
                data={mergeData}
                readOnly={featureNode.lifecycle === 'maintain'}
                onApprove={onMergeApprove ?? (() => undefined)}
                onReject={onMergeReject}
                isProcessing={Boolean((isMergeLoading ?? false) || continuationActionsDisabled)}
                isRejecting={isRejecting}
                chatInput={chatInput}
                onChatInputChange={onChatInputChange}
              />
            ) : (
              <div className="flex items-center justify-center p-8">
                {isMergeLoading ? (
                  <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
                ) : (
                  <div className="text-muted-foreground flex flex-col items-center gap-2 text-sm">
                    <AlertCircle className="h-6 w-6" />
                    <span>Merge review data unavailable</span>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        ) : null}

        {/* Chat tab — always visible when interactive agent is enabled (FR-1, FR-17) */}
        {visibleTabs.includes('chat') ? (
          <TabsContent value="chat" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
            <ChatTab featureId={featureId} worktreePath={featureNode.worktreePath} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}

// ── Private helper ──────────────────────────────────────────────────────

function DrawerActionBarForTech({
  onApprove,
  onReject,
  isProcessing,
  isRejecting,
  chatInput,
  onChatInputChange,
}: {
  onApprove: () => void;
  onReject?: (feedback: string, attachments: RejectAttachment[]) => void;
  isProcessing?: boolean;
  isRejecting?: boolean;
  chatInput?: string;
  onChatInputChange?: (value: string) => void;
}) {
  const { t } = useTranslation('web');
  return (
    <DrawerActionBar
      onReject={onReject}
      onApprove={onApprove}
      approveLabel={t('featureDrawer.approvePlan')}
      revisionPlaceholder="Ask AI to revise the plan..."
      isProcessing={isProcessing}
      isRejecting={isRejecting}
      chatInput={chatInput}
      onChatInputChange={onChatInputChange}
    />
  );
}
