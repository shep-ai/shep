'use client';

/**
 * AppTopBar — the application page header.
 *
 * Reorganised around a single primary action (SmartDeployButton) plus a
 * couple of supporting tools and an overflow menu for everything that
 * isn't day-to-day. Visual contract: 5 top-level groups separated by 1px
 * dividers — identity, source-context, primary action + local preview,
 * view switcher, overflow.
 *
 *    [◼] [Name] [● Ready]  ·  [slug] [📁]   →spacer→   [Save & publish ▾]   [▶ Preview]   [IDE Term Web]   [⋯]
 *    └── identity ──────┘     └── context ┘            └─── primary ───┘    └ local ┘    └── view ─┘   └ overflow ┘
 */

import { Database, LayoutGrid, ShieldCheck } from 'lucide-react';
import type { Application } from '@shepai/core/domain/generated/output';
import { BedrockTargetKind, DeploymentState } from '@shepai/core/domain/generated/output';
import type { ChatState } from '@shepai/core/application/ports/output/services/interactive-session-service.interface';
import { featureIdForApplication } from '@shepai/core/domain/shared/feature-id';

import { cn } from '@/lib/utils';
import { BedrockMemoryToggle } from '@/components/bedrock-memory-toggle';
import { BedrockMemorySection } from '@/components/bedrock-memory-section';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useState } from 'react';
import { SmartDeployCluster } from '@/components/features/application-page/smart-deploy-cluster';
import type { CloudDeployActionApi } from '@/hooks/use-cloud-deploy-action';
import type { DeployActionState } from '@/hooks/use-deploy-action';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useFeatureFlags } from '@/hooks/feature-flags-context';
import { AppOverflowMenu } from './app-overflow-menu';
import { AppViewTabs, type AppView } from './app-view-tabs';
import { CopyPromptButton } from './copy-prompt-button';
import { DeleteApplicationMenuItem } from './delete-application-menu-item';
import { OpenInControlCenterMenuItem } from './open-in-control-center-menu-item';
import { PathCluster } from './path-cluster';
import { SessionChip } from './session-chip';
import { StatusPill } from './status-pill';

/** Single source of truth for top-bar height. Both panes hang off this
 *  so nothing misaligns horizontally between left and right. */
export const TOP_BAR_HEIGHT_CLASS = 'h-12';

export interface AppTopBarProps {
  application: Application;
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  /** When true the agent is actively running — disable preview controls. */
  agentRunning: boolean;
  /** SSR-seeded chat state — used to initialize the session chip so it
   *  shows any already-captured sessionId/model before SSE updates
   *  arrive. Optional: the chip falls back to "—" when absent. */
  initialChatState?: ChatState;
  /** Shared dev-server deploy state (hoisted in ApplicationPage so the
   *  top-bar Preview button and the right-pane Web iframe use a single
   *  polling loop). */
  deploy: DeployActionState;
  /** Cloud deploy action state (spec 089). */
  cloudDeploy: CloudDeployActionApi;
}

export function AppTopBar({
  application,
  activeView,
  onViewChange,
  agentRunning,
  initialChatState,
  deploy,
  cloudDeploy,
}: AppTopBarProps) {
  const { collaboration, bedrockIntegration } = useFeatureFlags();
  const [bedrockSheetOpen, setBedrockSheetOpen] = useState(false);

  return (
    <header
      className={cn(
        'bg-background/95 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b px-3 backdrop-blur',
        TOP_BAR_HEIGHT_CLASS
      )}
    >
      {/* ── Group 1: identity ────────────────────────────────── */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-violet-500 shadow-xs">
        <LayoutGrid className="h-3.5 w-3.5 text-white" />
      </div>
      <h1 className="min-w-0 truncate text-sm font-semibold">{application.name}</h1>
      <StatusPill
        applicationId={application.id}
        persistedStatus={application.status}
        deployReady={deploy.status === DeploymentState.Ready}
      />

      <Divider />

      {/* ── Group 2: source context (slug + repo path + branch) ─ */}
      <PathCluster applicationId={application.id} repositoryPath={application.repositoryPath} />

      {/* ── Spacer ──────────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Group 3: primary action — Save / Publish / Deploy ─ */}
      <SmartDeployCluster
        application={application}
        cloudDeploy={cloudDeploy}
        agentRunning={agentRunning}
      />

      {/* ── Group 4: view switcher (folds in local preview state) ─
          The Web tab now owns the dev-server lifecycle — the old
          standalone Preview button has been removed. Clicking the Web
          tab while the dev server is idle starts it AND switches the
          view in one click; the tab's icon shows the current state
          (idle / spinner / pulsing green dot / red triangle) so a
          glance tells the user what's happening. Stop is reachable
          from inside the Web pane content (web-preview-tab URL bar). */}
      <AppViewTabs
        active={activeView}
        onChange={onViewChange}
        disabledTabs={[]}
        deploy={deploy}
        // "Building" covers both the initial setup window
        // (setupComplete flips true after the scaffolder + plan
        // finish) AND live user iterations that rewrite the project
        // tree — in both cases the preview is stale so we surface the
        // building stub instead of the old iframe.
        isBuilding={!application.setupComplete || agentRunning}
      />

      {bedrockIntegration ? (
        <>
          <Divider />
          <Sheet open={bedrockSheetOpen} onOpenChange={setBedrockSheetOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 px-2"
                data-testid="top-bar-bedrock"
                title="Bedrock memory"
              >
                <Database className="size-3.5" />
                <span className="hidden text-xs lg:inline">Bedrock</span>
                {application.bedrockEnabled ? (
                  <span className="ml-0.5 size-1.5 rounded-full bg-emerald-500" />
                ) : null}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[560px] sm:max-w-[560px]">
              <SheetHeader>
                <SheetTitle>Bedrock memory</SheetTitle>
                <SheetDescription>
                  Persistent markdown project memory for AI coding agents in {application.name}.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4">
                <BedrockMemorySection
                  targetKind={BedrockTargetKind.Application}
                  targetId={application.id}
                  targetLabel={application.name}
                  initialEnabled={application.bedrockEnabled === true}
                />
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : null}

      {collaboration ? (
        <>
          <Divider />
          <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 px-2">
            <Link
              href={`/application/${application.id}/supervisor`}
              data-testid="top-bar-supervisor"
              title="Configure supervisor for this application"
            >
              <ShieldCheck className="size-3.5" />
              <span className="hidden text-xs lg:inline">Supervisor</span>
            </Link>
          </Button>
        </>
      ) : null}

      {/* ── Group 5: overflow ─────────────────────────────── */}
      <AppOverflowMenu>
        <div className="px-2 py-1.5">
          <div className="text-muted-foreground text-[10px] tracking-wide uppercase">Session</div>
          <div className="mt-1">
            <SessionChip
              featureId={featureIdForApplication(application.id)}
              initialChatState={initialChatState}
              persistedSessionId={application.agentSessionId}
            />
          </div>
        </div>
        <div className="px-2 pb-2">
          <CopyPromptButton applicationId={application.id} />
        </div>
        {bedrockIntegration ? (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5">
              <BedrockMemoryToggle
                applicationId={application.id}
                initialEnabled={application.bedrockEnabled}
              />
            </div>
          </>
        ) : null}
        <DropdownMenuSeparator />
        {collaboration ? (
          <DropdownMenuItem asChild>
            <Link
              href={`/application/${application.id}/supervisor`}
              className="flex cursor-pointer items-center gap-2"
            >
              <ShieldCheck className="size-4" />
              Configure supervisor
            </Link>
          </DropdownMenuItem>
        ) : null}
        <OpenInControlCenterMenuItem applicationId={application.id} />
        <DeleteApplicationMenuItem
          applicationId={application.id}
          applicationName={application.name}
        />
      </AppOverflowMenu>
    </header>
  );
}

function Divider() {
  return <span className="bg-border/60 mx-1 h-5 w-px shrink-0" />;
}
