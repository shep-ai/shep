'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  LayoutGrid,
  GitBranch,
  Copy,
  FolderOpen,
  ClipboardList,
  Cpu,
  FilePlus,
  FilePen,
} from 'lucide-react';
import type { Application, ApplicationStatus } from '@shepai/core/domain/generated/output';
import { DeploymentState } from '@shepai/core/domain/generated/output';
import type { ChatState } from '@shepai/core/application/ports/output/services/interactive-session-service.interface';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChatTab } from '@/components/features/chat/ChatTab';
import { APPLICATION_CREATION_PLACEHOLDER_STEPS } from '@/components/features/chat/workflow-placeholder';
import { TerminalTab } from '@/components/features/application-page/terminal-tab';
import { IdeTab } from '@/components/features/application-page/ide-tab';
import { RunDevButton } from '@/components/features/application-page/run-dev-button';
import { WebPreviewTab } from '@/components/features/application-page/web-preview-tab';
import { useDeployAction, type DeployActionState } from '@/hooks/use-deploy-action';
import { useTurnStatus } from '@/hooks/turn-statuses-provider';
import { chatQueryKey, fetchChatState } from '@/components/features/chat/chat-state-query';
import { openFolder } from '@/app/actions/open-folder';
import { getApplicationDebugPrompt } from '@/app/actions/get-application-debug-prompt';
import { getGitRepoInfo } from '@/app/actions/get-git-log';

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

/** Single source of truth for top-bar height. Both panes hang off this
 *  so nothing misaligns horizontally between left and right. */
const TOP_BAR_HEIGHT_CLASS = 'h-11';

const MIN_LEFT_PX = 400;
const MIN_RIGHT_PX = 400;
const INITIAL_LEFT_FRACTION = 0.4;

const VIEW_TABS = ['ide', 'terminal', 'web'] as const;
type AppView = (typeof VIEW_TABS)[number];
const VIEW_LABELS: Record<AppView, string> = {
  ide: 'IDE',
  terminal: 'Terminal',
  web: 'Web',
};

/**
 * Derive a single effective status label + dot color. "Idle" is
 * never shown. MUST match the priority order in
 * `components/common/application-node/application-node.tsx` so the
 * canvas card and the application page agree on every parameter.
 *
 * Priority (highest wins):
 *
 *   - `processing`      → "In Progress"  (agent actively running a turn)
 *   - `awaiting_input`  → "Warning"      (agent blocked on user question)
 *   - deployReady       → "Live"         (dev server running at a real URL)
 *   - persisted Error   → "Error"
 *   - otherwise         → "Ready"        (agent finished, preview not running)
 */
function deriveLiveStatusPill(
  persistedStatus: ApplicationStatus,
  turnStatus: string,
  deployReady: boolean
): { label: string; dotClass: string; pulse: boolean } {
  if (turnStatus === 'processing') {
    return { label: 'In Progress', dotClass: 'bg-violet-500', pulse: true };
  }
  if (turnStatus === 'awaiting_input') {
    return { label: 'Warning', dotClass: 'bg-amber-500', pulse: true };
  }
  if (deployReady) {
    return { label: 'Live', dotClass: 'bg-emerald-500', pulse: true };
  }
  if (persistedStatus === 'Error') {
    return { label: 'Error', dotClass: 'bg-red-500', pulse: false };
  }
  return { label: 'Ready', dotClass: 'bg-sky-500', pulse: false };
}

/* ------------------------------------------------------------------ */
/*  Short path helper                                                  */
/* ------------------------------------------------------------------ */

/** Collapse a long absolute path to just its last segment. */
function shortPath(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? normalized : normalized.slice(idx + 1);
}

/* ------------------------------------------------------------------ */
/*  Top bar — one sleek line, inspired by Claude Code                  */
/* ------------------------------------------------------------------ */

interface AppTopBarProps {
  application: Application;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  onBack: () => void;
  /** SSR-seeded chat state — used to initialize the session chip so it
   *  shows any already-captured sessionId/model before SSE updates
   *  arrive. Optional: the chip falls back to "—" when absent. */
  initialChatState?: ChatState;
  /** Shared dev-server deploy state (hoisted in ApplicationPage so the
   *  top-bar Preview button and the right-pane Web iframe use a single
   *  polling loop). */
  deploy: DeployActionState;
}

function AppTopBar({
  application,
  activeView,
  onViewChange,
  onBack,
  initialChatState,
  deploy,
}: AppTopBarProps) {
  return (
    <header
      className={cn(
        'bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b px-3 backdrop-blur',
        TOP_BAR_HEIGHT_CLASS
      )}
    >
      {/* ── Left: back + identity ───────────────────────────────── */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Back to canvas"
        onClick={onBack}
        className="h-7 w-7"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
      </Button>

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
      <PathCluster repositoryPath={application.repositoryPath} />

      {/* ── Spacer ──────────────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Live session chip (model + short session id) ─────── */}
      <SessionChip featureId={`app-${application.id}`} initialChatState={initialChatState} />

      {/* ── Copy generated prompt (debug) ───────────────────── */}
      <CopyPromptButton applicationId={application.id} />

      {/* ── Preview (install + npm run dev, persistent) ─── */}
      <RunDevButton deploy={deploy} />

      {/* ── View switcher ─────────────────────────────────────── */}
      <ViewSwitcher active={activeView} onChange={onViewChange} />
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  Path cluster — short path + copy + open-in-file-manager            */
/* ------------------------------------------------------------------ */

function PathCluster({ repositoryPath }: { repositoryPath: string }) {
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(repositoryPath);
      toast.success('Path copied', { description: repositoryPath });
    } catch {
      toast.error('Failed to copy path');
    }
  }, [repositoryPath]);

  const handleOpen = useCallback(async () => {
    const result = await openFolder(repositoryPath);
    if (!result.success) {
      toast.error('Could not open folder', { description: result.error });
    }
  }, [repositoryPath]);

  return (
    <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
      <span className="truncate font-mono text-[11px]" title={repositoryPath}>
        {shortPath(repositoryPath)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground h-5 w-5"
        onClick={handleCopy}
        aria-label="Copy path"
        title="Copy path"
      >
        <Copy className="h-3 w-3" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground h-5 w-5"
        onClick={handleOpen}
        aria-label="Open in file manager"
        title="Open in file manager"
      >
        <FolderOpen className="h-3 w-3" />
      </Button>
      <span className="text-muted-foreground/40">·</span>
      <GitStatusCluster repositoryPath={repositoryPath} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Git status cluster — branch name + added/edited file counts        */
/* ------------------------------------------------------------------ */

/** Polls git repo info for current branch + working-tree diff numbers.
 *  Rendered inline next to the repo path so users can see at a glance
 *  which branch the application repo is on and how many files have
 *  been added or edited since the last commit. */
function GitStatusCluster({ repositoryPath }: { repositoryPath: string }) {
  const { data } = useQuery({
    queryKey: ['git-repo-info', repositoryPath],
    queryFn: () => getGitRepoInfo(repositoryPath, 1),
    enabled: Boolean(repositoryPath),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    staleTime: 2000,
  });

  const trimmedBranch = data?.currentBranch?.trim();
  const branch = trimmedBranch && trimmedBranch.length > 0 ? trimmedBranch : 'main';
  const added = data?.workingTree.untracked ?? 0;
  const edited = data?.workingTree.modified ?? 0;
  const insertions = data?.diffStats?.insertions ?? 0;
  const deletions = data?.diffStats?.deletions ?? 0;
  const hasChanges = added > 0 || edited > 0;

  const handleCommit = useCallback(() => {
    toast.info('Commit (not wired up yet)', {
      description: `Would commit ${edited} edited / ${added} added file(s) on ${branch}`,
    });
  }, [added, edited, branch]);

  const handleCommitPush = useCallback(() => {
    toast.info('Commit & Push (not wired up yet)', {
      description: `Would commit and push ${edited} edited / ${added} added file(s) on ${branch}`,
    });
  }, [added, edited, branch]);

  return (
    <div className="flex items-center gap-2 font-mono text-[11px]">
      <span className="flex items-center gap-1" title={`Branch: ${branch}`}>
        <GitBranch className="h-3 w-3" />
        {branch}
      </span>
      {added > 0 ? (
        <span
          className="flex items-center gap-0.5 text-emerald-500"
          title={`${added} added ${added === 1 ? 'file' : 'files'}`}
        >
          <FilePlus className="h-3 w-3" />
          {added}
        </span>
      ) : null}
      {edited > 0 ? (
        <span
          className="flex items-center gap-0.5 text-amber-500"
          title={`${edited} edited ${edited === 1 ? 'file' : 'files'}`}
        >
          <FilePen className="h-3 w-3" />
          {edited}
        </span>
      ) : null}
      {insertions > 0 || deletions > 0 ? (
        <span
          className="flex items-center gap-1"
          title={`${insertions} insertions, ${deletions} deletions vs HEAD`}
        >
          {insertions > 0 ? <span className="text-emerald-500">+{insertions}</span> : null}
          {deletions > 0 ? <span className="text-rose-500">-{deletions}</span> : null}
        </span>
      ) : null}
      {hasChanges ? (
        <>
          <button
            type="button"
            onClick={handleCommit}
            className="border-border bg-background text-foreground hover:bg-muted inline-flex h-6 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] font-medium transition-colors"
            title="Commit working tree changes"
          >
            Commit
          </button>
          <button
            type="button"
            onClick={handleCommitPush}
            className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2 text-[11px] font-medium text-indigo-600 transition-colors hover:bg-indigo-500/20 dark:text-indigo-400"
            title="Commit and push to remote"
          >
            Commit &amp; Push
          </button>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Session chip — model + short session id, live via shared query     */
/* ------------------------------------------------------------------ */

function SessionChip({
  featureId,
  initialChatState,
}: {
  featureId: string;
  initialChatState?: ChatState;
}) {
  // Reads from the SAME TanStack Query cache entry the chat tab uses.
  // The `message`/`session_status`/`turn_status` SSE events inside
  // ChatTab's useChatRuntime mutate this cache directly, so the chip
  // updates live as the session transitions booting → ready and the
  // SDK reports back its assigned session id.
  const { data: chatState } = useQuery({
    queryKey: chatQueryKey(featureId),
    queryFn: () => fetchChatState(featureId),
    initialData: initialChatState,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const sessionInfo = chatState?.sessionInfo;
  const sessionId = sessionInfo?.sessionId ?? null;
  const model = sessionInfo?.model ?? null;
  const shortId = sessionId ? sessionId.slice(0, 8) : null;

  const handleCopy = useCallback(async () => {
    if (!sessionId) return;
    try {
      await navigator.clipboard.writeText(sessionId);
      toast.success('Session ID copied', { description: sessionId });
    } catch {
      toast.error('Failed to copy session id');
    }
  }, [sessionId]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!sessionId}
      className={cn(
        'border-border/60 bg-muted/40 text-muted-foreground inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 font-mono text-[10px] transition-colors',
        sessionId
          ? 'hover:bg-muted hover:text-foreground cursor-pointer'
          : 'cursor-default opacity-60'
      )}
      title={sessionId ? `Click to copy full session id: ${sessionId}` : 'No session yet'}
      aria-label={sessionId ? 'Copy session id' : 'No active session'}
    >
      <Cpu className="h-3 w-3 opacity-60" />
      <span className="font-medium">{model ?? 'agent'}</span>
      <span className="text-muted-foreground/50">·</span>
      <span>{shortId ?? '—'}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Copy prompt — debug dump of the full generated system+user prompt  */
/* ------------------------------------------------------------------ */

function CopyPromptButton({ applicationId }: { applicationId: string }) {
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await getApplicationDebugPrompt(applicationId);
      if (result.error || !result.combined) {
        toast.error('Failed to build prompt', { description: result.error });
        return;
      }
      await navigator.clipboard.writeText(result.combined);
      const systemLen = result.systemPrompt?.length ?? 0;
      const userLen = result.userMessage?.length ?? 0;
      toast.success('Prompt copied to clipboard', {
        description: `${systemLen} chars system + ${userLen} chars user`,
      });
    } catch (err) {
      toast.error('Failed to copy prompt', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }, [applicationId, busy]);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleClick}
      disabled={busy}
      className="text-muted-foreground hover:text-foreground h-7 w-7"
      aria-label="Copy full generated prompt (debug)"
      title="Copy full generated prompt (debug) — system + user message"
    >
      <ClipboardList className="h-3.5 w-3.5" />
    </Button>
  );
}

function StatusPill({
  applicationId,
  persistedStatus,
  deployReady,
}: {
  applicationId: string;
  persistedStatus: ApplicationStatus;
  deployReady: boolean;
}) {
  // Read live turn status from the global SSE subscription and fold
  // it PLUS the dev-server deploy state onto the persisted status so
  // the pill reflects real-time reality ("Working" / "Waiting" /
  // "Unread" / "Live") instead of being stuck at the coarse DB
  // snapshot which almost always reads "Idle".
  const turnStatus = useTurnStatus(`app-${applicationId}`);
  const live = deriveLiveStatusPill(persistedStatus, turnStatus, deployReady);

  return (
    <span className="border-border/60 inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 text-[10px] font-medium tracking-wide uppercase">
      <span
        className={cn(
          'relative flex h-1.5 w-1.5 items-center justify-center rounded-full',
          live.dotClass
        )}
      >
        {live.pulse ? (
          <span
            className={cn(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
              live.dotClass
            )}
          />
        ) : null}
      </span>
      {live.label}
    </span>
  );
}

function Divider() {
  return <span className="bg-border/60 mx-1 h-4 w-px shrink-0" />;
}

function ViewSwitcher({
  active,
  onChange,
}: {
  active: AppView;
  onChange: (view: AppView) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Right pane view"
      className="bg-muted/60 flex items-center rounded-md p-0.5"
    >
      {VIEW_TABS.map((v) => {
        const selected = v === active;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(v)}
            className={cn(
              'h-6 cursor-pointer rounded-sm px-2.5 text-[11px] font-medium transition-colors',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {VIEW_LABELS[v]}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Resizable split panel                                              */
/* ------------------------------------------------------------------ */

function ResizableSplit({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftFraction, setLeftFraction] = useState(INITIAL_LEFT_FRACTION);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const totalWidth = rect.width;
    const x = e.clientX - rect.left;

    const clampedX = Math.max(MIN_LEFT_PX, Math.min(x, totalWidth - MIN_RIGHT_PX));
    setLeftFraction(clampedX / totalWidth);
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1">
      {/* Left pane — flush with top bar, no internal header */}
      <div
        className="flex min-h-0 flex-col overflow-hidden"
        style={{ flexBasis: `${leftFraction * 100}%`, flexShrink: 0 }}
      >
        {left}
      </div>

      {/* Divider — 1px line, hover thickens for grip */}
      <div
        role="separator"
        aria-orientation="vertical"
        className="group border-border hover:bg-primary/20 relative w-px shrink-0 cursor-col-resize border-l transition-colors"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* 8px wide invisible hit target centered on the 1px line */}
        <span className="absolute inset-y-0 -right-1 -left-1" />
      </div>

      {/* Right pane — flush with top bar, no internal header */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{right}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Right-pane views                                                    */
/* ------------------------------------------------------------------ */

/**
 * Right-pane view body.
 *
 * The Terminal tab is kept mounted (just hidden) when not active so its
 * PTY session, scrollback, and running processes survive tab switches.
 * Other views are placeholders until implemented.
 */
function ViewBody({
  activeView,
  applicationId,
  terminalCwd,
  deploy,
}: {
  activeView: AppView;
  applicationId: string;
  terminalCwd: string;
  deploy: DeployActionState;
}) {
  // Mount the Web iframe as soon as there's a URL — even if the user
  // is currently on IDE / Terminal — so the preview session doesn't
  // tear down when switching tabs. Once the app has been Previewed
  // at least once, the iframe stays alive in the background.
  const hasWebContent =
    deploy.status === DeploymentState.Ready ||
    deploy.status === DeploymentState.Booting ||
    deploy.deployLoading ||
    !!deploy.deployError;

  return (
    <div className="relative flex min-h-0 flex-1">
      {/* Terminal — always mounted to preserve the PTY session. */}
      <div
        className={cn(
          'absolute inset-0 flex min-h-0 flex-col',
          activeView === 'terminal' ? 'visible' : 'pointer-events-none invisible'
        )}
        aria-hidden={activeView !== 'terminal'}
      >
        <TerminalTab cwd={terminalCwd} />
      </div>

      {/* IDE — also kept mounted so open tabs and scroll position survive
          tab switches between IDE / Terminal / Web. */}
      <div
        className={cn(
          'absolute inset-0 flex min-h-0 flex-col',
          activeView === 'ide' ? 'visible' : 'pointer-events-none invisible'
        )}
        aria-hidden={activeView !== 'ide'}
      >
        <IdeTab applicationId={applicationId} />
      </div>

      {/* Web — iframe the running dev server. Kept mounted once we
          have meaningful deploy state so switching tabs doesn't tear
          down the preview session. When there's no deploy activity
          yet we still render the empty state (only while visible)
          so the user sees the "Run" CTA. */}
      {hasWebContent ? (
        <div
          className={cn(
            'absolute inset-0 flex min-h-0 flex-col',
            activeView === 'web' ? 'visible' : 'pointer-events-none invisible'
          )}
          aria-hidden={activeView !== 'web'}
        >
          <WebPreviewTab deploy={deploy} />
        </div>
      ) : (
        activeView === 'web' && <WebPreviewTab deploy={deploy} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ApplicationPage                                                    */
/* ------------------------------------------------------------------ */

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
  const router = useRouter();
  const [activeView, setActiveView] = useState<AppView>('ide');

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

  // Back → control center. We navigate AND refresh so the dashboard layout
  // re-runs `getGraphData()` server-side. Without `router.refresh()` the
  // App Router serves the cached RSC from when the user was last on `/`,
  // which does NOT include the application they just created.
  const handleBack = useCallback(() => {
    router.push('/');
    router.refresh();
  }, [router]);

  return (
    <div className="bg-background flex h-dvh flex-col">
      <AppTopBar
        application={application}
        activeView={activeView}
        onViewChange={setActiveView}
        onBack={handleBack}
        initialChatState={initialChatState}
        deploy={deploy}
      />
      <ResizableSplit
        left={
          <ChatTab
            featureId={`app-${application.id}`}
            worktreePath={application.repositoryPath}
            initialAgent={application.agentType}
            initialModel={application.modelOverride}
            initialChatState={initialChatState}
            hideHeader
            workflowPlaceholder={APPLICATION_CREATION_PLACEHOLDER_STEPS}
            onAllStepsComplete={() => {
              // Kick off the dev server as soon as the agent has
              // finished the scaffold workflow. The Idle→Ready
              // transition in the deploy hook then auto-switches
              // the right pane to the Web preview, so the user
              // lands on their running app with zero clicks.
              //
              // Important: the provider's default entry is
              // `{ status: null }` when no dev server has ever run
              // for this application, NOT `'Stopped'`. The previous
              // `=== 'Stopped'` check silently did nothing on the
              // very first completion of a freshly created app,
              // which is exactly when auto-preview matters most.
              // Trigger as long as we're not already Booting/Ready.
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
          />
        }
      />
    </div>
  );
}
