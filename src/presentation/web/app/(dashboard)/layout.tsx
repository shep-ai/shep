import type { ReactNode } from 'react';
import { ControlCenter } from '@/components/features/control-center';
import { DeploymentStatusProvider } from '@/hooks/deployment-status-provider';
import { getGraphData } from './get-graph-data';

/** Skip static pre-rendering since we need runtime DI container and server context. */
export const dynamic = 'force-dynamic';

interface DashboardLayoutProps {
  children: ReactNode;
  drawer: ReactNode;
}

export default async function DashboardLayout({ children, drawer }: DashboardLayoutProps) {
  const { nodes, edges, deployments } = await getGraphData();

  return (
    <div className="h-screen w-full">
      <DeploymentStatusProvider initialDeployments={deployments}>
        <ControlCenter initialNodes={nodes} initialEdges={edges} drawer={drawer} />
        {children}
      </DeploymentStatusProvider>
    </div>
  );
}
