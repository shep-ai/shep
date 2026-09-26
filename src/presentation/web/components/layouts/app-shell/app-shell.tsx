'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ErrorBoundary } from '@/components/common/error-boundary';
import { useRouter, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Direction } from 'radix-ui';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layouts/app-sidebar';
import { pickFolder } from '@/components/common/add-repository-button/pick-folder';
import { buildCreateUrl } from '@/lib/url-params';

// Heavy global overlays — defer their JS chunks until the user actually
// needs them. Each pulls in a non-trivial dependency chain (assistant-ui,
// radix-dialog content, etc.) that we don't want on the critical path of
// the initial page load. `ssr: false` because none of them need to render
// during SSR (they're modals/popovers triggered by client interaction).
const GlobalChatPopup = dynamic(
  () => import('@/components/features/chat/ChatSheet').then((m) => m.GlobalChatPopup),
  { ssr: false }
);
const GlobalSearchDialog = dynamic(
  () =>
    import('@/components/features/search/global-search-dialog').then((m) => m.GlobalSearchDialog),
  { ssr: false }
);
const GitHubImportDialog = dynamic(
  () => import('@/components/common/github-import-dialog').then((m) => m.GitHubImportDialog),
  { ssr: false }
);
const BulkImportDialog = dynamic(
  () => import('@/components/common/bulk-import-dialog').then((m) => m.BulkImportDialog),
  { ssr: false }
);
const ReactFileManagerDialog = dynamic(
  () =>
    import('@/components/common/react-file-manager-dialog').then((m) => m.ReactFileManagerDialog),
  { ssr: false }
);
import { AgentEventsProvider } from '@/hooks/agent-events-provider';
import { DrawerCloseGuardProvider, useDrawerCloseGuard } from '@/hooks/drawer-close-guard';
import {
  SidebarFeaturesProvider,
  useSidebarFeaturesContext,
} from '@/hooks/sidebar-features-context';
import { TurnStatusesProvider } from '@/hooks/turn-statuses-provider';

import { useIsMobile } from '@/hooks/use-mobile';
import { useNotifications } from '@/hooks/use-notifications';
import { useFeatureFlags } from '@/hooks/feature-flags-context';
import type { ShellVariant } from '@/lib/shell-variant';
import { ShellVariantProvider } from '@/hooks/shell-variant-context';
import { AppsOnlyShell } from './apps-only-shell';

interface AppShellProps {
  children: ReactNode;
  /** Server-read sidebar state from cookie. */
  sidebarOpen?: boolean;
  /**
   * Outer-chrome variant. `full` (default) renders the existing sidebar
   * + FAB + canvas chrome. `apps-only` renders a slim shell with just a
   * top bar — see spec 091-apps-only-surface.
   */
  variant?: ShellVariant;
  /** Server-read initial state indicating if the user has repositories. */
  initialHasRepositories?: boolean;
}

function AppShellInner({ children, sidebarOpen, variant = 'full' }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const { guardedNavigate } = useDrawerCloseGuard();
  const featureFlags = useFeatureFlags();

  // Application-centric routes own their own primary actions (smart
  // deploy split-button in the top bar, create FAB on the list page)
  // so the global chat FAB is redundant there and was colliding with
  // the page-level FAB. Hide it entirely on /applications (list) and
  // /application/[id] (individual app page).
  const hideGlobalChat =
    pathname === '/applications' ||
    pathname?.startsWith('/applications/') ||
    pathname?.startsWith('/application/');

  // Subscribe to agent lifecycle events and dispatch toast/browser
  // notifications. The apps-only desktop surface suppresses toasts
  // entirely — the StepTracker + operation logs drawer already tell
  // the story inside the app, and a stack of toasts over the preview
  // pane just adds noise.
  useNotifications(variant !== 'apps-only');

  const { features } = useSidebarFeaturesContext();

  const handleFeatureClick = useCallback(
    (featureId: string) => {
      guardedNavigate(() => router.push(`/feature/${featureId}`));
    },
    [router, guardedNavigate]
  );

  const handleAddFeature = useCallback(
    (repositoryPath: string) => {
      guardedNavigate(() => router.push(buildCreateUrl({ repo: repositoryPath })));
    },
    [router, guardedNavigate]
  );

  // Every global overlay below is wrapped in an ErrorBoundary whose
  // fallback is an explicit `null`: these widgets render nothing until the
  // user opens them, so replacing a crashed one with an error card would
  // leave a permanent 200px panel in the shell on behalf of a closed
  // dialog. Rendering nothing is right — being SILENT is not. Without this
  // report a crashed GlobalSearchDialog just means Cmd+K stops working
  // forever with no clue anywhere, which is how it went unnoticed.
  //
  // One report per surface per mount: a boundary stops rendering its
  // children once it catches, so a crash cannot loop, and the stable toast
  // id makes a remount replace the toast instead of stacking a new one.
  const reportedOverlayCrashes = useRef<Set<string>>(new Set());
  const reportOverlayCrash = useCallback((surface: string, message: string) => {
    if (reportedOverlayCrashes.current.has(surface)) return;
    reportedOverlayCrashes.current.add(surface);
    toast.error(message, { id: `shell-overlay-${surface}` });
  }, []);

  const [addingRepo, setAddingRepo] = useState(false);
  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const [showReactPicker, setShowReactPicker] = useState(false);
  // Bulk import: first pick a PARENT folder, then choose among its subfolders.
  const [showBulkPicker, setShowBulkPicker] = useState(false);
  const [bulkDirectory, setBulkDirectory] = useState('');

  const handleAddRepository = useCallback(async () => {
    if (addingRepo) return;

    if (featureFlags.reactFileManager) {
      setShowReactPicker(true);
      return;
    }

    setAddingRepo(true);
    try {
      const path = await pickFolder();
      if (path) {
        window.dispatchEvent(new CustomEvent('shep:add-repository', { detail: { path } }));
      }
    } catch {
      // Native picker failed — fall back to React file manager
      setShowReactPicker(true);
    } finally {
      setAddingRepo(false);
    }
  }, [addingRepo, featureFlags.reactFileManager]);

  // Listen for pick-folder events from the canvas toolbar
  useEffect(() => {
    const handler = () => {
      void handleAddRepository();
    };
    window.addEventListener('shep:pick-folder', handler);
    return () => window.removeEventListener('shep:pick-folder', handler);
  }, [handleAddRepository]);

  // Listen for GitHub import event from (+) FAB
  useEffect(() => {
    const handler = () => setGithubDialogOpen(true);
    window.addEventListener('shep:open-github-import', handler);
    return () => window.removeEventListener('shep:open-github-import', handler);
  }, []);

  // Listen for bulk "folder of repos" import from the (+) FAB
  useEffect(() => {
    const handler = () => setShowBulkPicker(true);
    window.addEventListener('shep:open-bulk-import', handler);
    return () => window.removeEventListener('shep:open-bulk-import', handler);
  }, []);

  const handleBulkDirectorySelect = useCallback((path: string | null) => {
    setShowBulkPicker(false);
    if (path) setBulkDirectory(path);
  }, []);

  // Refresh the canvas so newly imported repositories appear.
  const handleBulkImportComplete = useCallback(
    (importedCount: number) => {
      setBulkDirectory('');
      if (importedCount > 0) router.refresh();
    },
    [router]
  );

  const handleReactPickerSelect = useCallback((path: string | null) => {
    if (path) {
      window.dispatchEvent(new CustomEvent('shep:add-repository', { detail: { path } }));
    }
    setShowReactPicker(false);
  }, []);

  const handleGitHubImportComplete = useCallback((repository: { path?: string }) => {
    if (repository.path) {
      window.dispatchEvent(
        new CustomEvent('shep:add-repository', { detail: { path: repository.path } })
      );
    }
  }, []);

  if (variant === 'apps-only') {
    return <AppsOnlyShell>{children}</AppsOnlyShell>;
  }

  return (
    <SidebarProvider defaultOpen={sidebarOpen ?? false}>
      {/* WCAG 2.4.1 (Bypass Blocks): the first tabbable element in the
          shell, so a keyboard or screen-reader user can jump straight to
          the page content instead of tabbing the whole sidebar nav on
          every route. Invisible until focused, then a normal button-sized
          target in the top-left corner. `tabIndex={-1}` on the <main>
          target is what makes the browser move FOCUS there and not just
          the scroll position. */}
      <a
        href="#main-content"
        data-testid="skip-to-main"
        className="focus:bg-background focus:ring-ring sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:ring-2 focus:outline-none"
      >
        Skip to main content
      </a>
      <AppSidebar
        features={features}
        featureFlags={featureFlags}
        onFeatureClick={handleFeatureClick}
        onAddFeature={handleAddFeature}
      />
      {/* The Control Center's session-tree sub-nav is rendered by the
          (dashboard) layout, which owns the providers it shares with the
          canvas. */}
      <SidebarInset id="main-content" tabIndex={-1} className="min-w-0">
        {/* `h-dvh` (not `h-full`) so the full-shell page area has an
            explicit viewport-bound height regardless of child content.
            Without this, the outer `SidebarProvider`'s `min-h-svh`
            allows the tree to GROW past the viewport when a child
            (e.g. the application page's expanded step tracker) exceeds
            viewport height, producing an outer body scrollbar. */}
        <div className="relative flex h-dvh flex-col">
          {isMobile ? (
            <header className="bg-background flex h-12 shrink-0 items-center gap-2 border-b px-3 md:hidden">
              <SidebarTrigger className="size-10" />
              <span className="text-sm font-semibold">Shep</span>
            </header>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {/* Global chat popup — fixed, visible across pages EXCEPT
              on application routes where the page owns its own
              primary actions and the chat FAB is redundant. */}
          {hideGlobalChat ? null : (
            <ErrorBoundary
              fallback={null}
              onError={() =>
                reportOverlayCrash('chat', 'Shep Chat stopped working — reload the page to use it.')
              }
            >
              <GlobalChatPopup />
            </ErrorBoundary>
          )}
          {/* Global search dialog — Cmd+K / Ctrl+K */}
          <ErrorBoundary
            fallback={null}
            onError={() =>
              reportOverlayCrash('search', 'Search is unavailable — reload the page to use Cmd+K.')
            }
          >
            <GlobalSearchDialog />
          </ErrorBoundary>
          <ErrorBoundary
            fallback={null}
            onError={() =>
              reportOverlayCrash(
                'github-import',
                'The GitHub import dialog stopped working — reload the page to retry.'
              )
            }
          >
            <GitHubImportDialog
              open={githubDialogOpen}
              onOpenChange={setGithubDialogOpen}
              onImportComplete={handleGitHubImportComplete}
            />
          </ErrorBoundary>
        </div>
      </SidebarInset>
      <ErrorBoundary
        fallback={null}
        onError={() =>
          reportOverlayCrash(
            'file-picker',
            'The file picker stopped working — reload the page to retry.'
          )
        }
      >
        <ReactFileManagerDialog
          open={showReactPicker}
          onOpenChange={(open) => {
            if (!open) setShowReactPicker(false);
          }}
          onSelect={handleReactPickerSelect}
        />
      </ErrorBoundary>
      <ErrorBoundary
        fallback={null}
        onError={() =>
          reportOverlayCrash(
            'bulk-file-picker',
            'The folder picker stopped working — reload the page to retry.'
          )
        }
      >
        <ReactFileManagerDialog
          open={showBulkPicker}
          onOpenChange={(open) => {
            if (!open) setShowBulkPicker(false);
          }}
          onSelect={handleBulkDirectorySelect}
        />
      </ErrorBoundary>
      <ErrorBoundary
        fallback={null}
        onError={() =>
          reportOverlayCrash(
            'bulk-import',
            'Bulk import stopped working — reload the page to retry.'
          )
        }
      >
        <BulkImportDialog
          open={bulkDirectory !== ''}
          onOpenChange={(open) => {
            if (!open) setBulkDirectory('');
          }}
          directoryPath={bulkDirectory}
          onImportComplete={handleBulkImportComplete}
        />
      </ErrorBoundary>
    </SidebarProvider>
  );
}

/** Wraps children with TurnStatusesProvider (polls all active statuses from backend). */
function TurnStatusesBridge({ children }: { children: ReactNode }) {
  return <TurnStatusesProvider>{children}</TurnStatusesProvider>;
}

export function AppShell({
  children,
  sidebarOpen,
  variant = 'full',
  initialHasRepositories = false,
}: AppShellProps) {
  const { i18n } = useTranslation();
  const dir = i18n.dir();

  return (
    <Direction.Provider dir={dir}>
      <AgentEventsProvider>
        <DrawerCloseGuardProvider>
          <SidebarFeaturesProvider initialHasRepositories={initialHasRepositories}>
            <TurnStatusesBridge>
              <ShellVariantProvider variant={variant}>
                <AppShellInner sidebarOpen={sidebarOpen} variant={variant}>
                  {children}
                </AppShellInner>
              </ShellVariantProvider>
            </TurnStatusesBridge>
          </SidebarFeaturesProvider>
        </DrawerCloseGuardProvider>
      </AgentEventsProvider>
    </Direction.Provider>
  );
}
