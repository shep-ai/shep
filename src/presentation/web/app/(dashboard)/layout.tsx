import type { ReactNode } from 'react';
import { ControlCenter } from '@/components/features/control-center';
import { SessionTreePanel } from '@/components/features/session-tree';
import { DeploymentStatusProvider } from '@/hooks/deployment-status-provider';
import { SessionsProvider } from '@/hooks/sessions-provider';
import { getGraphData } from './get-graph-data';

/** Skip static pre-rendering since we need runtime DI container and server context. */
export const dynamic = 'force-dynamic';

interface DashboardLayoutProps {
  children: ReactNode;
  drawer: ReactNode;
}

/**
 * The Control Center shell: session-tree sub-nav beside the canvas.
 *
 * The tree lives here rather than in the app shell for two reasons. It is this
 * route group's own chrome — every route in the group renders over the canvas,
 * so "which routes show the tree" is answered by the layout boundary instead of
 * a hand-maintained path list, which had already shipped wrong twice. And it
 * puts the tree inside the same deployment and sessions providers as the
 * canvas, so a repository action taken on either surface is reflected in both.
 *
 * `FleetControl` (spec 111) used to mount here, pinned to the canvas's top
 * right. It overlapped the canvas chrome and covered the workspace beneath it,
 * so the mount is withdrawn until the surface is redesigned. The components,
 * their stories, tests, the `getFleetData` action and `shep fleet status` are
 * all untouched — re-mounting is a one-line change once the placement is
 * settled. See the tracking issue for the redesign.
 */
export default async function DashboardLayout({ children, drawer }: DashboardLayoutProps) {
  const { nodes, edges, deployments } = await getGraphData();

  return (
    <div className="flex h-screen w-full">
      <DeploymentStatusProvider initialDeployments={deployments}>
        <SessionsProvider>
          <aside
            className="hidden h-full shrink-0 md:block"
            aria-label="Session tree"
            data-testid="session-tree-sidenav"
          >
            <SessionTreePanel />
          </aside>
          <div className="relative min-w-0 flex-1">
            <ControlCenter initialNodes={nodes} initialEdges={edges} drawer={drawer} />
            {children}
          </div>
        </SessionsProvider>
      </DeploymentStatusProvider>
    </div>
  );
}
