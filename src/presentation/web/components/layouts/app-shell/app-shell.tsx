'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Direction } from 'radix-ui';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layouts/app-sidebar';
import { ReactFileManagerDialog } from '@/components/common/react-file-manager-dialog';
import { GlobalChatPopup } from '@/components/features/chat/ChatSheet';
import { GlobalSearchDialog } from '@/components/features/search/global-search-dialog';
import { pickFolder } from '@/components/common/add-repository-button/pick-folder';
import { GitHubImportDialog } from '@/components/common/github-import-dialog';
import { AgentEventsProvider } from '@/hooks/agent-events-provider';
import { DrawerCloseGuardProvider, useDrawerCloseGuard } from '@/hooks/drawer-close-guard';
import {
  SidebarFeaturesProvider,
  useSidebarFeaturesContext,
} from '@/hooks/sidebar-features-context';
import { TurnStatusesProvider } from '@/hooks/turn-statuses-provider';

import { useNotifications } from '@/hooks/use-notifications';
import { useFeatureFlags } from '@/hooks/feature-flags-context';
import type { ShellVariant } from '@/lib/shell-variant';
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
}

function AppShellInner({ children, sidebarOpen, variant = 'full' }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
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
      guardedNavigate(() => router.push(`/create?repo=${encodeURIComponent(repositoryPath)}`));
    },
    [router, guardedNavigate]
  );

  const [addingRepo, setAddingRepo] = useState(false);
  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const [showReactPicker, setShowReactPicker] = useState(false);

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
      <AppSidebar
        features={features}
        featureFlags={featureFlags}
        onFeatureClick={handleFeatureClick}
        onAddFeature={handleAddFeature}
      />
      <SidebarInset>
        {/* `h-dvh` (not `h-full`) so the full-shell page area has an
            explicit viewport-bound height regardless of child content.
            Without this, the outer `SidebarProvider`'s `min-h-svh`
            allows the tree to GROW past the viewport when a child
            (e.g. the application page's expanded step tracker) exceeds
            viewport height, producing an outer body scrollbar. */}
        <div className="relative h-dvh">
          <main className="h-full min-h-0">{children}</main>
          {/* Global chat popup — fixed, visible across pages EXCEPT
              on application routes where the page owns its own
              primary actions and the chat FAB is redundant. */}
          {hideGlobalChat ? null : <GlobalChatPopup />}
          {/* Global search dialog — Cmd+K / Ctrl+K */}
          <GlobalSearchDialog />
          {featureFlags.githubImport ? (
            <GitHubImportDialog
              open={githubDialogOpen}
              onOpenChange={setGithubDialogOpen}
              onImportComplete={handleGitHubImportComplete}
            />
          ) : null}
        </div>
      </SidebarInset>
      <ReactFileManagerDialog
        open={showReactPicker}
        onOpenChange={(open) => {
          if (!open) setShowReactPicker(false);
        }}
        onSelect={handleReactPickerSelect}
      />
    </SidebarProvider>
  );
}

/** Wraps children with TurnStatusesProvider (polls all active statuses from backend). */
function TurnStatusesBridge({ children }: { children: ReactNode }) {
  return <TurnStatusesProvider>{children}</TurnStatusesProvider>;
}

export function AppShell({ children, sidebarOpen, variant = 'full' }: AppShellProps) {
  const { i18n } = useTranslation();
  const dir = i18n.dir();

  return (
    <Direction.Provider dir={dir}>
      <AgentEventsProvider>
        <DrawerCloseGuardProvider>
          <SidebarFeaturesProvider>
            <TurnStatusesBridge>
              <AppShellInner sidebarOpen={sidebarOpen} variant={variant}>
                {children}
              </AppShellInner>
            </TurnStatusesBridge>
          </SidebarFeaturesProvider>
        </DrawerCloseGuardProvider>
      </AgentEventsProvider>
    </Direction.Provider>
  );
}
