'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
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

interface AppShellProps {
  children: ReactNode;
  /** Server-read sidebar state from cookie. */
  sidebarOpen?: boolean;
}

function AppShellInner({ children, sidebarOpen }: AppShellProps) {
  const router = useRouter();
  const { guardedNavigate } = useDrawerCloseGuard();
  const featureFlags = useFeatureFlags();

  // Subscribe to agent lifecycle events and dispatch toast/browser notifications
  useNotifications();

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

  return (
    <SidebarProvider defaultOpen={sidebarOpen ?? false}>
      <AppSidebar
        features={features}
        featureFlags={featureFlags}
        onFeatureClick={handleFeatureClick}
        onAddFeature={handleAddFeature}
      />
      <SidebarInset>
        <div className="relative h-full">
          <main className="h-full">{children}</main>
          {/* Global chat popup — fixed, visible across all pages */}
          <GlobalChatPopup />
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

export function AppShell({ children, sidebarOpen }: AppShellProps) {
  const { i18n } = useTranslation();
  const dir = i18n.dir();

  return (
    <Direction.Provider dir={dir}>
      <AgentEventsProvider>
        <DrawerCloseGuardProvider>
          <SidebarFeaturesProvider>
            <TurnStatusesBridge>
              <AppShellInner sidebarOpen={sidebarOpen}>{children}</AppShellInner>
            </TurnStatusesBridge>
          </SidebarFeaturesProvider>
        </DrawerCloseGuardProvider>
      </AgentEventsProvider>
    </Direction.Provider>
  );
}
