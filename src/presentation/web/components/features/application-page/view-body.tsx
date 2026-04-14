'use client';

import { DeploymentState } from '@shepai/core/domain/generated/output';

import { cn } from '@/lib/utils';
import { TerminalTab } from '@/components/features/application-page/terminal-tab';
import { IdeTab } from '@/components/features/application-page/ide-tab';
import { WebPreviewTab } from '@/components/features/application-page/web-preview-tab';
import type { DeployActionState } from '@/hooks/use-deploy-action';

import type { AppView } from './app-view-tabs';

export interface ViewBodyProps {
  activeView: AppView;
  applicationId: string;
  terminalCwd: string;
  deploy: DeployActionState;
}

/**
 * Right-pane view body.
 *
 * The Terminal tab is kept mounted (just hidden) when not active so its
 * PTY session, scrollback, and running processes survive tab switches.
 * Other views are placeholders until implemented.
 */
export function ViewBody({ activeView, applicationId, terminalCwd, deploy }: ViewBodyProps) {
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
